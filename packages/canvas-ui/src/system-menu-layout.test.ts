import {expect,test} from 'vitest';
import {topHudLayout} from './system-menu-layout';
for(const width of [360,640,1000])test(`separate top HUD bounds at${width}`,()=>{const l=topHudLayout(width,[90,65,96,94,65,66]);for(const b of l.buttons){expect(b.x).toBeGreaterThanOrEqual(12);expect(b.x+b.w).toBeLessThanOrEqual(width-12);expect(b.y>=l.vessel.y+l.vessel.h||b.x>=l.vessel.x+l.vessel.w).toBe(true);}for(let i=0;i<l.buttons.length;i++)for(let j=i+1;j<l.buttons.length;j++){const a=l.buttons[i],b=l.buttons[j];expect(a.x+a.w<=b.x||b.x+b.w<=a.x||a.y+a.h<=b.y||b.y+b.h<=a.y).toBe(true);}});
