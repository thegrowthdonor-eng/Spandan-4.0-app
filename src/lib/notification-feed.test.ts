import assert from "node:assert/strict";
import test from "node:test";
import {NOTIFICATION_INTERVAL,subscribeNotifications} from "./notification-feed";

test("notification instances share one fetch and do not poll hidden tabs",async()=>{
  const previousFetch=globalThis.fetch;
  const target=new EventTarget();const document={hidden:false,addEventListener:target.addEventListener.bind(target),removeEventListener:target.removeEventListener.bind(target)};
  const prior=Object.getOwnPropertyDescriptor(globalThis,"document");Object.defineProperty(globalThis,"document",{value:document,configurable:true});
  let requests=0,deliveries=0;
  globalThis.fetch=async()=>{requests++;return Response.json({ok:true,items:[]});};
  const a=subscribeNotifications(()=>deliveries++);const b=subscribeNotifications(()=>deliveries++);
  try {
    await new Promise(resolve=>setTimeout(resolve,10));
    assert.equal(NOTIFICATION_INTERVAL,300_000);assert.equal(requests,1);assert.equal(deliveries,2);
    document.hidden=true;target.dispatchEvent(new Event("visibilitychange"));
    const c=subscribeNotifications(()=>deliveries++);c();
    await new Promise(resolve=>setTimeout(resolve,10));assert.equal(requests,1);
  }finally{a();b();globalThis.fetch=previousFetch;if(prior)Object.defineProperty(globalThis,"document",prior);else Reflect.deleteProperty(globalThis,"document");}
});
