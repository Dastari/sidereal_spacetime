import { describe, expect, it } from 'vitest';
import { walk } from './index';
import { CABIN_COLLIDERS } from '../../content/src/interior';
import { constrainLabDeck, repairLabDeckPosition } from '../../content/src/pilot-layout';
function advance(x:number,y:number,dx:number,dy:number,steps=300) {
  let p={x,y};
  for(let i=0;i<steps;i++) {
    const next=walk(p.x,p.y,dx,dy,CABIN_COLLIDERS,true,constrainLabDeck);
    expect(Math.hypot(next.x-p.x,next.y-p.y)).toBeLessThanOrEqual(.07500001);
    p=next;
  }
  return p;
}
describe('native R006 planar crew clearance',()=>{
  it('passes the single central doorway both ways and blocks both jambs',()=>{
    expect(advance(0,8,0,1,30).y).toBeGreaterThan(10);
    expect(advance(0,10.25,0,-1,35).y).toBeLessThan(8);
    for(const sign of [-1,1]) {
      expect(advance(sign*.5,8,0,1).y).toBeLessThanOrEqual(8.325);
      expect(advance(sign*.5,9.6,0,-1).y).toBeGreaterThanOrEqual(9.3);
    }
  });
  it('blocks straight glazing, diagonal canopy and nose with standing-crew clearance',()=>{
    for(const sign of [-1,1]) {
      const side=advance(0,10.25,sign,0);
      expect(Math.abs(side.x)).toBeCloseTo(1.968,8);
      const diagonal=advance(sign*1.6,10.25,sign,1);
      expect(Math.abs(diagonal.x)+diagonal.y).toBeLessThanOrEqual(12.54054);
    }
    // At this point the console is behind the crew; the transom remains solid.
    expect(advance(0,11.95,0,1).y).toBe(11.968);
  });
  it('does not snap a crew member across the narrowing hull or let them escape aft',()=>{
    const p=advance(3.5,8,0,1);
    expect(p.x).toBe(3.5); expect(p.y).toBeLessThanOrEqual(8.325);
    expect(advance(0,-7,0,-1).y).toBe(-8);
  });
  it('repairs old outside and jamb positions without moving valid seated/aisle positions',()=>{
    expect(repairLabDeckPosition(4,10)).toEqual({x:1.968,y:10});
    expect(repairLabDeckPosition(1,8.7)).toEqual({x:1,y:8.325});
    expect(repairLabDeckPosition(0,10.25)).toEqual({x:0,y:10.25});
  });
});
