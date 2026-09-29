import type { Infer, InferSchema, ReducerCtx } from "spacetimedb/server";
import type world from "./index";
import type * as tables from "./construction-flight-tables";
type Row<T extends { rowType: unknown }> = T extends { rowType: infer R }
  ? Infer<R>
  : never;
type Binding = Row<typeof tables.constructionFlightBinding>;
type Fitting = Row<typeof tables.constructionFlightFitting>;
type Station = Row<typeof tables.constructionFlightStation>;
type Receipt = Row<typeof tables.constructionFlightReceipt>;
interface Primary<R> {
  find(id: string): R | null | undefined;
}
interface Table<R> {
  insert(row: R): unknown;
}
export interface ConstructionFlightTables {
  constructionFlightBinding: Table<Binding> & { shipId: Primary<Binding> };
  constructionFlightFitting: Table<Fitting> & {
    id: Primary<Fitting>;
    by_ship: { filter(shipId: string): Iterable<Fitting> };
  };
  constructionFlightStation: Table<Station> & { stationId: Primary<Station> };
  constructionFlightReceipt: Table<Receipt> & { id: Primary<Receipt> };
}
type BaseContext = ReducerCtx<InferSchema<typeof world>>;
export type ConstructionFlightContext = Omit<BaseContext, "db"> & {
  db: BaseContext["db"] & ConstructionFlightTables;
};
