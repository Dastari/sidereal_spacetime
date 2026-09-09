import {expect,test,vi} from 'vitest';
import {createCombatInput,type CombatInputState} from './combat-input';

test('aim permission is rechecked before firing after an asynchronous heartbeat',async()=>{
  let release!:()=>void;
  const state:CombatInputState={active:true,allowed:true,blocked:false,weapon:{itemId:'gun',revision:1n,energy:50,shotCost:4,cooldownMs:100}};
  const fire=vi.fn(async()=>{});
  const input=createCombatInput({state:()=>state,aim:()=>.5,sendAim:()=>new Promise<void>(resolve=>release=resolve),fire,error:()=>{}});
  input.trigger(true);state.blocked=true;release();await Promise.resolve();await Promise.resolve();
  expect(fire).not.toHaveBeenCalled();input.dispose();
});

test('held fire respects reported energy and cooldown without modifying balances',async()=>{
  let time=0;
  const state:CombatInputState={active:true,allowed:true,blocked:false,weapon:{itemId:'gun',revision:1n,energy:4,shotCost:4,cooldownMs:100}};
  const fire=vi.fn(async()=>{}),sendAim=vi.fn(async()=>{});
  const input=createCombatInput({state:()=>state,aim:()=>.5,sendAim,fire,error:()=>{},now:()=>time});
  input.trigger(true);await Promise.resolve();await Promise.resolve();
  expect(fire).toHaveBeenCalledTimes(1);expect(state.weapon?.energy).toBe(4);
  await input.tick();expect(fire).toHaveBeenCalledTimes(1);
  time=101;state.weapon!.energy=0;await input.tick();expect(fire).toHaveBeenCalledTimes(1);
  state.active=false;await input.tick();expect(sendAim).toHaveBeenLastCalledWith(false,.5);
  input.dispose();
});

test('a released tap survives an asynchronous aim heartbeat exactly once',async()=>{
  let release!:()=>void;
  const state:CombatInputState={active:true,allowed:true,blocked:false,weapon:{itemId:'gun',revision:1n,energy:50,shotCost:4,cooldownMs:0}};
  const fire=vi.fn(async()=>{});
  const sendAim=vi.fn(()=>new Promise<void>(resolve=>release=resolve));
  const input=createCombatInput({state:()=>state,aim:()=>.5,sendAim,fire,error:()=>{}});
  input.trigger(true);input.trigger(false);release();await Promise.resolve();await Promise.resolve();
  expect(fire).toHaveBeenCalledExactlyOnceWith('gun',1n);
  const next=input.tick();release();await next;expect(fire).toHaveBeenCalledTimes(1);input.dispose();
});

test('cancelled taps and weapon switches cannot replay a pending shot',async()=>{
  for(const cancel of [true,false]){
    let release!:()=>void;
    const state:CombatInputState={active:true,allowed:true,blocked:false,weapon:{itemId:'gun',revision:1n,energy:50,shotCost:4,cooldownMs:0}};
    const fire=vi.fn(async()=>{});
    const input=createCombatInput({state:()=>state,aim:()=>.5,sendAim:()=>new Promise<void>(resolve=>release=resolve),fire,error:()=>{}});
    input.trigger(true);input.trigger(false);
    if(cancel)input.cancel();else state.weapon={...state.weapon!,itemId:'other'};
    release();await Promise.resolve();await Promise.resolve();expect(fire).not.toHaveBeenCalled();input.dispose();
  }
});
