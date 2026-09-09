import { table,t } from 'spacetimedb/server';
export const characterAppearance=table({name:'character_appearance'}, {
  characterId:t.string().primaryKey(),revision:t.u64(),appearanceJson:t.string(),
});
export const appearanceReceipt=table({name:'appearance_receipt',indexes:[{accessor:'by_character',algorithm:'btree',columns:['characterId']}]}, {
  id:t.string().primaryKey(),characterId:t.string(),request:t.string(),revision:t.u64(),
});
