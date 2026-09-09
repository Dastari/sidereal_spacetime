/** Bounded cosmetic documents, independent of renderer and gameplay equipment. */
export function validateAppearanceJson(json:string, enums:Readonly<Record<string,readonly string[]>>, colors:readonly string[]):string {
  if (typeof json !== 'string' || json.length > 2048) throw new Error('Appearance exceeds document limit');
  let value:unknown;
  try { value=JSON.parse(json); } catch { throw new Error('Invalid appearance JSON'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Appearance must be an object');
  const result:Record<string,string>={};
  for(const key of Object.keys(value).sort()) {
    const field=(value as Record<string,unknown>)[key];
    if(typeof field!=='string') throw new Error('Invalid appearance value');
    if(Object.hasOwn(enums,key)) {
      if(!enums[key].includes(field)) throw new Error('Unknown appearance choice');
      result[key]=field;
    } else if(colors.includes(key) && /^#[0-9a-f]{6}$/i.test(field)) result[key]=field.toLowerCase();
    else throw new Error('Unsupported appearance field or color');
  }
  return JSON.stringify(result);
}
