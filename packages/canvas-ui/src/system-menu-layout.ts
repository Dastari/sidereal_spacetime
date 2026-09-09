import type {Rect} from './layout';
/** Separate vessel panel and right-aligned actions; compact screens wrap actions. */
export function topHudLayout(width:number,buttonWidths:readonly number[]){
 const vessel:Rect={x:12,y:12,w:Math.min(184,Math.max(120,width-24)),h:43};
 const sum=buttonWidths.reduce((a,b)=>a+b+4,0)-4;
 const sameRow=width>=vessel.w+sum+48;const available=width-24;
 const rows:number[][]=[[]];let used=0;
 buttonWidths.forEach((size,i)=>{if(used&&used+4+size>available){rows.push([]);used=0;}rows.at(-1)!.push(i);used+=size+(used?4:0);});
 const buttons:Rect[]=[];let bottom=55;
 rows.forEach((row,ri)=>{const rw=row.reduce((a,i)=>a+buttonWidths[i]+4,0)-4;let x=width-12-rw;const y=(sameRow?18:63)+ri*39;row.forEach(i=>{buttons[i]={x,y,w:buttonWidths[i],h:31};x+=buttonWidths[i]+4;});bottom=Math.max(bottom,y+31);});
 return {vessel,buttons,bottom};
}
