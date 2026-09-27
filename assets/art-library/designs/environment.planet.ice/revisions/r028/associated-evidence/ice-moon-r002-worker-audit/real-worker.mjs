import{parentPort,workerData}from'node:worker_threads';
import{composeIceMoonReference}from'/root/sidereal_spacetime/scripts/art_library/ice_moon_reference_composition_r002.ts';
const t=performance.now(),batches=composeIceMoonReference(workerData.kit,38,0);parentPort.postMessage({batches,composeMs:performance.now()-t},{transfer:batches.flatMap(b=>[b.positions.buffer,b.normals.buffer,b.uvs.buffer,b.indices.buffer])});
