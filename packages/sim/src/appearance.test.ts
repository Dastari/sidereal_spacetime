import {describe,it,expect} from 'vitest';
import {validateAppearanceJson} from './appearance';
import {CHARACTER_APPEARANCE_ENUMS as enums,CHARACTER_APPEARANCE_COLORS as colors} from '../../content/src/appearance';
const validate=(value:unknown)=>validateAppearanceJson(JSON.stringify(value),enums,colors);
describe('persisted character cosmetics',()=>{
 it('retains every supported look and legacy choice with canonical colors',()=>{
  for(const outfit of enums.outfit)expect(JSON.parse(validate({outfit,skin:'#AABBCC',helmet:'closed'}))).toEqual({outfit,skin:'#aabbcc',helmet:'closed'});
  for(const [key,values]of Object.entries(enums))for(const value of values)expect(JSON.parse(validate({[key]:value}))[key]).toBe(value);
  expect(validate({suit:'#112233',outfit:'engineer'})).toBe(validate({outfit:'engineer',suit:'#112233'}));
 });
 it('rejects equipment impersonation, unknown fields, malformed and unbounded documents',()=>{
  for(const value of [{weapon:'rifle'},{backpack:true},{weaponFixture:true},{outfit:'admin'},{skin:'red'},{skin:'#abc'},{helmet:42},[],null])expect(()=>validate(value)).toThrow();
  expect(()=>validateAppearanceJson('{',enums,colors)).toThrow();
  expect(()=>validateAppearanceJson(' '.repeat(2049),enums,colors)).toThrow();
  expect(()=>validateAppearanceJson('{"__proto__":"x"}',enums,colors)).toThrow();
 });
});
