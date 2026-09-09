import './hull-decals.css';
import type { PartAsset, PartPlacement } from '../../../../packages/content/src/assembly';
import type { HullDecal } from '../../../../packages/content/src/hull-decals';
/** Shared inspector for the assembly editor and the integrated Hull workspace. */
export function HullDecalPanel({ part, asset, disabled, change }: {
  part: PartPlacement; asset?: PartAsset; disabled?: boolean; change: (decals: HullDecal[]) => void;
}) {
  const decals = part.decals ?? [];
  const edit = (id: string, patch: Partial<HullDecal>) => change(decals.map(d => d.id === id ? { ...d, ...patch } : d));
  const add = (kind: HullDecal['kind']) => {
    const b = asset?.visual?.bounds ?? asset?.bounds ?? { min: [-1,-1,0], max: [1,1,1] };
    change([...decals, { id: crypto.randomUUID(), kind, ...(kind === 'text' ? { text: 'WAYFARER' } : {}), face: 'top',
      position: [(b.min[0]+b.max[0])/2,(b.min[1]+b.max[1])/2,b.max[2]],
      size: [Math.max(.05,Math.min(16,(b.max[0]-b.min[0])*.75)), Math.max(.05,Math.min(1,(b.max[1]-b.min[1])*.5))], rotation: 0, color: '#d8d3c5' }]);
  };
  return <fieldset disabled={disabled} className="hull-decal-panel"><legend>Hull markings</legend>
    <p className="fine-print">Paint on this component. Place on a flat surface; offsets are local metres. Markings follow its movement; lettering stays readable when flipped.</p>
    {decals.map((d,index) => <fieldset key={d.id}><legend>Marking {index+1}</legend>
      {d.kind === 'text' ? <label>Wording<input aria-label={`Marking ${index+1} wording`} maxLength={32} value={d.text} onChange={e => { const text=e.target.value.replace(/[^A-Za-z0-9 ._/-]/g,''); if(text.length) edit(d.id,{text}); }} /></label> : <p>Frontier planet emblem</p>}
      <label>Surface<select value={d.face ?? 'top'} onChange={e => edit(d.id,{face:e.target.value as HullDecal['face']})}><option value="top">Top</option><option value="front">Front (north)</option><option value="right">Right (east)</option><option value="left">Left (west)</option></select></label>
      <div className="part-position">{['East','North','Height'].map((axis,i) => <label key={axis}>{axis}<input aria-label={`Marking ${index+1} ${axis}`} type="number" step="0.01" min={-64} max={64} value={d.position[i]} onChange={e => { const n=Number(e.target.value); if(!Number.isFinite(n)||Math.abs(n)>64)return; const position=[...d.position] as HullDecal['position']; position[i]=n; edit(d.id,{position}); }} /></label>)}</div>
      {['Width','Height'].map((axis,i) => <label key={axis}>{axis} · m<input aria-label={`Marking ${index+1} size ${axis}`} type="number" step="0.05" min={.05} max={16} value={d.size[i]} onChange={e => { const n=Number(e.target.value);if(!Number.isFinite(n)||n<.05||n>16)return; const size=[...d.size] as HullDecal['size'];size[i]=n;edit(d.id,{size}); }} /></label>)}
      <label>Angle · degrees<input type="number" min={-360} max={360} value={Math.round(d.rotation*180/Math.PI)} onChange={e => { const n=Number(e.target.value);if(Number.isFinite(n)&&Math.abs(n)<=360)edit(d.id,{rotation:n*Math.PI/180}); }} /></label>
      <label>Paint<input type="color" value={d.color} onChange={e => edit(d.id,{color:e.target.value})} /></label>
      <button type="button" className="secondary full" onClick={() => change(decals.filter(x => x.id!==d.id))}>Remove marking {index+1}</button>
    </fieldset>)}
    <button type="button" className="secondary full" disabled={decals.length>=4} onClick={() => add('text')}>Add hull wording</button>
    <button type="button" className="secondary full" disabled={decals.length>=4} onClick={() => add('frontier-planet')}>Add Frontier emblem</button>
  </fieldset>;
}
