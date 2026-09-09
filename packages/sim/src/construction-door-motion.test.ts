import {expect,test} from 'vitest';
import {doorLeafObstacle,doorMotionStep,doorSweepOccupied} from './construction-door-motion';
const frame={id:'door',origin:[0,0] as [number,number],quarterTurns:0};
test('physical leaf retains native hinge translation and clears the exact aperture when fully open',()=>{
 const closed=doorLeafObstacle(frame,0),open=doorLeafObstacle(frame,1);
 expect(Math.min(...closed.vertices.map(p=>p[0]))).toBeCloseTo(.3125);
 expect(Math.max(...closed.vertices.map(p=>p[0]))).toBeCloseTo(1.623);
 expect(Math.max(...open.vertices.map(p=>p[0]))).toBeCloseTo(.375);
 expect(Math.min(...open.vertices.map(p=>p[1]))).toBeCloseTo(-1.373);
 expect(closed.id).toBe(open.id);
});
test('quarter turns transform the complete leaf around its world-frame hinge without mirroring',()=>{
 const a=doorLeafObstacle(frame,.5),b=doorLeafObstacle({id:'door',origin:[7,9],quarterTurns:1},.5);
 b.vertices.forEach((p,i)=>{expect(p[0]).toBeCloseTo(7-a.vertices[i][1]);expect(p[1]).toBeCloseTo(9+a.vertices[i][0]);});
});
test('swept envelope rejects a body between sampled leaf positions including circle radius and rotated frames',()=>{
 expect(doorSweepOccupied(frame,[{position:[1,-1],radius:.3}])).toBe(true);
 expect(doorSweepOccupied(frame,[{position:[1,.2],radius:.3}])).toBe(true);
 expect(doorSweepOccupied(frame,[{position:[1,.5],radius:.3}])).toBe(false);
 expect(doorSweepOccupied({...frame,quarterTurns:1,origin:[7,9]},[{position:[8,10],radius:.3}])).toBe(true);
});
test('motion blocks without teleporting, resumes, and completes only at exact endpoints',()=>{
 let state={fraction:0,targetOpen:true,blocked:false};
 state=doorMotionStep(state,.25,1,false);expect(state.fraction).toBe(.25);
 state=doorMotionStep(state,.25,1,true);expect(state).toEqual({fraction:.25,targetOpen:true,blocked:true});
 for(let i=0;i<3;i++)state=doorMotionStep(state,.25,1,false);
 expect(state).toEqual({fraction:1,targetOpen:true,blocked:false});
 state=doorMotionStep({...state,targetOpen:false},.25,1,false);expect(state.fraction).toBe(.75);
 expect(doorMotionStep({fraction:0,targetOpen:false,blocked:true},.25,1,true).blocked).toBe(false);
});
test('invalid states, unbounded steps and arbitrary transforms are rejected',()=>{
 expect(()=>doorMotionStep({fraction:2,targetOpen:true,blocked:false},.05,1,false)).toThrow();
 expect(()=>doorMotionStep({fraction:0,targetOpen:true,blocked:false},2,1,false)).toThrow();
 expect(()=>doorLeafObstacle({...frame,quarterTurns:.5},0)).toThrow();
 expect(()=>doorSweepOccupied(frame,[{position:[NaN,0],radius:.3}])).toThrow();
});
