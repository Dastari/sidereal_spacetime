/** Small-row bounded simplex. Wrench feasibility has strict priority over cost:
 * no finite penalty is allowed to buy force error. Variables are throttles;
 * the three artificial axes are removed from the feasible set before cost work. */
export function minimumNewtonAllocation(
  columns: readonly number[][],
  target: number[],
  costs: number[],
  passBudget = 80,
) {
  const n = columns.length,
    vectors = [
      ...columns,
      ...target.map((v, j) =>
        [0, 1, 2].map((k) => (k === j ? (v < 0 ? -1 : 1) : 0)),
      ),
    ];
  const values = [...new Array<number>(n).fill(0), ...target.map(Math.abs)];
  const upper = [...new Array<number>(n).fill(1), Infinity, Infinity, Infinity];
  const basis = [n, n + 1, n + 2];
  let pivots = 0,
    converged = true;
  const maximumPivots = passBudget * Math.max(1, n);
  function inverse() {
    const a = [0, 1, 2].map((r) => [
      ...basis.map((i) => vectors[i][r]),
      ...[0, 1, 2].map((c) => Number(r === c)),
    ]);
    for (let k = 0; k < 3; k++) {
      let best = k;
      for (let r = k + 1; r < 3; r++)
        if (Math.abs(a[r][k]) > Math.abs(a[best][k])) best = r;
      [a[k], a[best]] = [a[best], a[k]];
      if (Math.abs(a[k][k]) < 1e-13)
        throw new Error("Singular flight allocation basis");
      const scale = a[k][k];
      for (let c = 0; c < 6; c++) a[k][c] /= scale;
      for (let r = 0; r < 3; r++)
        if (r !== k) {
          const scale = a[r][k];
          for (let c = 0; c < 6; c++) a[r][c] -= scale * a[k][c];
        }
    }
    return a.map((r) => r.slice(3));
  }
  function optimize(objective: number[]) {
    while (pivots < maximumPivots) {
      const inv = inverse(),
        basic = new Set(basis);
      const dual = [0, 1, 2].map((k) =>
        basis.reduce((sum, b, r) => sum + objective[b] * inv[r][k], 0),
      );
      let entering = -1,
        direction = 0;
      // Bland's physical-column order prevents degeneracy cycling; IDs never enter here.
      for (let j = 0; j < vectors.length; j++) {
        if (basic.has(j) || upper[j] === 0) continue;
        const reduced =
          objective[j] - vectors[j].reduce((sum, v, k) => sum + v * dual[k], 0);
        const d = values[j] < upper[j] - 1e-10 ? 1 : -1;
        if (reduced * d < -1e-10) {
          entering = j;
          direction = d;
          break;
        }
      }
      if (entering < 0) return true;
      const change = inv.map(
        (row) =>
          -direction *
          row.reduce((sum, v, k) => sum + v * vectors[entering][k], 0),
      );
      let step =
          direction > 0 ? upper[entering] - values[entering] : values[entering],
        leaving = -1;
      for (let r = 0; r < 3; r++) {
        const d = change[r];
        if (Math.abs(d) < 1e-12) continue;
        const limit = Math.max(
          0,
          d > 0
            ? (upper[basis[r]] - values[basis[r]]) / d
            : -values[basis[r]] / d,
        );
        if (!Number.isFinite(limit)) continue;
        const ratioTolerance =
          16 *
          Number.EPSILON *
          Math.max(Math.abs(limit), Number.isFinite(step) ? Math.abs(step) : 0);
        if (
          limit < step - ratioTolerance ||
          (Math.abs(limit - step) <= ratioTolerance &&
            (leaving < 0 || basis[r] < basis[leaving]))
        ) {
          step = limit;
          leaving = r;
        }
      }
      if (!Number.isFinite(step))
        throw new Error("Unbounded flight allocation");
      for (let r = 0; r < 3; r++)
        values[basis[r]] = Math.max(
          0,
          Math.min(upper[basis[r]], values[basis[r]] + step * change[r]),
        );
      values[entering] = Math.max(
        0,
        Math.min(upper[entering], values[entering] + step * direction),
      );
      if (leaving >= 0) basis[leaving] = entering;
      pivots++;
    }
    return false;
  }
  converged = optimize([...new Array<number>(n).fill(0), 1, 1, 1]);
  const feasibilityTolerance = Math.max(
    Number.MIN_VALUE,
    1e-12 * Math.max(...target.map(Math.abs)),
  );
  const feasible = values.slice(n).every((v) => v < feasibilityTolerance);
  if (feasible && converged) {
    for (let j = n; j < n + 3; j++) {
      values[j] = 0;
      upper[j] = 0;
    }
    converged = optimize([...costs, 0, 0, 0]);
  }
  let optimalFace = Array.from({ length: n }, (_, i) => i);
  if (feasible && converged) {
    const inv = inverse(),
      objective = [...costs, 0, 0, 0];
    const dual = [0, 1, 2].map((k) =>
      basis.reduce((sum, b, r) => sum + objective[b] * inv[r][k], 0),
    );
    optimalFace = optimalFace.filter(
      (i) =>
        Math.abs(
          costs[i] - vectors[i].reduce((sum, v, k) => sum + v * dual[k], 0),
        ) < 1e-9,
    );
  }
  return {
    values: values.slice(0, n),
    optimalFace,
    feasible,
    converged,
    passes: Math.ceil(pivots / Math.max(1, n)),
    pivots,
  };
}

/** Dual Newton solution of min 1/2 ||throttle||² on the fixed optimum face.
 * All four equalities (three wrench axes AND actual newtons) are constraints,
 * never objective penalties. An unfinished solve retains the feasible input. */
export function balanceMinimumEffort(
  columns: readonly number[][],
  costs: number[],
  input: number[],
  passBudget: number,
  optimalFace: number[],
) {
  const vectors = optimalFace.map((i) => [...columns[i], costs[i]]);
  const target = [0, 1, 2, 3].map((k) =>
    vectors.reduce((sum, v, i) => sum + v[k] * input[optimalFace[i]], 0),
  );
  const restore = (values: number[]) => {
    const result = input.slice();
    optimalFace.forEach((index, i) => {
      const v = values[i];
      result[index] = v > 1 - 1e-13 ? 1 : v;
    });
    return result;
  };
  const tolerance = Math.max(
    Number.MIN_VALUE,
    1e-14 * Math.min(1, Math.max(...target.map(Math.abs))),
  );
  const dual = [0, 0, 0, 0];
  const evaluate = (point: number[]) => {
    const z = vectors.map((v) =>
      v.reduce((sum, a, k) => sum + a * point[k], 0),
    );
    const values = z.map((v) => Math.max(0, Math.min(1, v)));
    const gradient = target.map((b, k) =>
      vectors.reduce((sum, v, i) => sum + v[k] * values[i], -b),
    );
    const objective =
      z.reduce(
        (sum, v) => sum + (v <= 0 ? 0 : v < 1 ? (v * v) / 2 : v - 0.5),
        0,
      ) - target.reduce((sum, b, k) => sum + b * point[k], 0);
    return { z, values, gradient, objective };
  };
  let state = evaluate(dual);
  for (let pass = 0; pass < passBudget; pass++) {
    if (Math.max(...state.gradient.map(Math.abs)) < tolerance)
      return { values: restore(state.values), passes: pass, converged: true };
    const matrix = [0, 1, 2, 3].map((r) => [
      ...[0, 1, 2, 3].map((c) =>
        vectors.reduce(
          (sum, v, i) =>
            sum +
            (state.z[i] >= -1e-12 && state.z[i] <= 1 + 1e-12 ? v[r] * v[c] : 0),
          r === c ? 1e-12 : 0,
        ),
      ),
      -state.gradient[r],
    ]);
    for (let k = 0; k < 4; k++) {
      let best = k;
      for (let r = k + 1; r < 4; r++)
        if (Math.abs(matrix[r][k]) > Math.abs(matrix[best][k])) best = r;
      [matrix[k], matrix[best]] = [matrix[best], matrix[k]];
      const divisor = matrix[k][k];
      for (let c = k; c < 5; c++) matrix[k][c] /= divisor;
      for (let r = 0; r < 4; r++)
        if (r !== k) {
          const multiplier = matrix[r][k];
          for (let c = k; c < 5; c++) matrix[r][c] -= multiplier * matrix[k][c];
        }
    }
    const direction = matrix.map((r) => r[4]);
    const slope = direction.reduce(
      (sum, d, k) => sum + d * state.gradient[k],
      0,
    );
    let accepted = false;
    for (let step = 1, backtrack = 0; backtrack < 48; backtrack++, step /= 2) {
      const point = dual.map((v, k) => v + direction[k] * step),
        next = evaluate(point);
      if (next.objective <= state.objective + 1e-4 * step * slope + 1e-14) {
        dual.splice(0, 4, ...point);
        state = next;
        accepted = true;
        break;
      }
    }
    if (!accepted) return { values: input, passes: pass + 1, converged: false };
  }
  return Math.max(...state.gradient.map(Math.abs)) < tolerance
    ? { values: restore(state.values), passes: passBudget, converged: true }
    : { values: input, passes: passBudget, converged: false };
}
