import {table,t} from 'spacetimedb/server';
/** Additive links preserve original container rows and UUIDs. */
export const storageBinding=table({name:'storage_binding',indexes:[{accessor:'by_character',algorithm:'btree',columns:['characterId']}]},{id:t.string().primaryKey(),characterId:t.string(),containerId:t.string().unique(),placementId:t.string()});
