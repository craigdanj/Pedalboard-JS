import{clamp,dbToGain}from'./dsp.js';
export{detectPitch,noteFromFrequency,levels,gainToDb,dbToGain}from'./dsp.js';
export const VERSION='1.0.0';
const p=(label,min,max,step,value,unit='')=>({label,min,max,step,value,unit});
export const EFFECTS={
 gate:{name:'Noise gate',tag:'DYNAMICS',color:'sage',params:{threshold:p('Threshold',-80,-10,1,-48,'dB'),attack:p('Attack',.2,30,.2,3,'ms'),release:p('Release',10,600,5,120,'ms')}},
 compressor:{name:'Compressor',tag:'DYNAMICS',color:'sand',params:{threshold:p('Threshold',-50,0,1,-22,'dB'),ratio:p('Ratio',1,12,.5,3,':1'),attack:p('Attack',1,100,1,12,'ms'),release:p('Release',20,800,10,180,'ms'),makeup:p('Makeup',0,18,.5,2,'dB')}},
 overdrive:{name:'Overdrive',tag:'DRIVE',color:'orange',params:{drive:p('Drive',0,100,1,25,'%'),tone:p('Tone',500,10000,50,3800,'Hz'),level:p('Level',-30,6,.5,-8,'dB')}},
 eq:{name:'Equalizer',tag:'TONE',color:'blue',params:{low:p('Low · 120 Hz',-18,18,.5,0,'dB'),mid:p('Mid',-18,18,.5,0,'dB'),frequency:p('Mid frequency',200,4000,25,900,'Hz'),high:p('High · 3.5 kHz',-18,18,.5,0,'dB')}},
 chorus:{name:'Chorus',tag:'MODULATION',color:'lilac',params:{rate:p('Rate',.1,5,.1,.8,'Hz'),depth:p('Depth',0,10,.1,3,'ms'),mix:p('Mix',0,100,1,28,'%')}},
 delay:{name:'Delay',tag:'TIME',color:'rose',params:{time:p('Time',25,1500,5,375,'ms'),feedback:p('Feedback',0,85,1,28,'%'),tone:p('Tone',800,10000,100,4500,'Hz'),mix:p('Mix',0,100,1,22,'%')}},
 reverb:{name:'Reverb',tag:'SPACE',color:'mint',params:{decay:p('Decay',.2,6,.1,2.4,'s'),tone:p('Tone',1000,12000,100,6000,'Hz'),mix:p('Mix',0,100,1,18,'%')}},
 cabinet:{name:'Cabinet IR',tag:'CONVOLUTION',color:'stone',params:{lowcut:p('Low cut',20,300,5,70,'Hz'),highcut:p('High cut',1500,16000,100,7000,'Hz'),level:p('Level',-24,12,.5,0,'dB')}}};
const registrations=new WeakMap();
export function initialize(ctx){if(!registrations.has(ctx))registrations.set(ctx,ctx.audioWorklet.addModule(new URL('./gate-worklet.js',import.meta.url)).catch(e=>{registrations.delete(ctx);throw e;}));return registrations.get(ctx);}
function smooth(p,v,ctx){p.setTargetAtTime(v,ctx.currentTime,.015);}
export class Effect{
 constructor(ctx,type,o={}){this.context=ctx;this.type=type;this.nodes=[];this.sources=[];this.disposed=false;this.input=this.node(ctx.createGain());this.output=this.node(ctx.createGain());this.dry=this.node(ctx.createGain());this.wet=this.node(ctx.createGain());this.inlet=this.node(ctx.createGain());this.outlet=this.node(ctx.createGain());this.input.connect(this.dry).connect(this.output);this.input.connect(this.inlet);this.outlet.connect(this.wet).connect(this.output);this.values=Object.fromEntries(Object.entries(EFFECTS[type].params).map(([k,v])=>[k,v.value]));this.enabled=o.enabled??true;this.dry.gain.value=this.enabled?0:1;this.wet.gain.value=this.enabled?1:0;}
 node(n){this.nodes.push(n);return n;}
 setParam(name,value){const s=EFFECTS[this.type].params[name];if(!s||!Number.isFinite(Number(value)))throw new TypeError(`Invalid ${this.type} parameter: ${name}`);this.values[name]=clamp(Number(value),s.min,s.max);this.update(name);return this;}
 configure(values={}){for(const[k,v]of Object.entries(values))this.setParam(k,v);return this;}
 setEnabled(v){this.enabled=Boolean(v);smooth(this.dry.gain,this.enabled?0:1,this.context);smooth(this.wet.gain,this.enabled?1:0,this.context);return this;}
 connect(dest){this.output.connect(dest.input||dest);return dest;}
 disconnect(){this.output.disconnect();}
 serialize(){return{type:this.type,enabled:this.enabled,params:{...this.values}};}
 dispose(){if(this.disposed)return;this.disposed=true;clearTimeout(this.timer);this.sources.forEach(s=>s.stop());this.nodes.forEach(n=>n.disconnect());}
}
export class NoiseGate extends Effect{
 constructor(ctx,o={}){super(ctx,'gate',o);this.processor=this.node(new AudioWorkletNode(ctx,'pedalboard-gate'));this.inlet.connect(this.processor).connect(this.outlet);this.configure(this.values);this.configure(o.params);}
 update(k){smooth(this.processor.parameters.get(k),this.values[k],this.context);}
}
export class Compressor extends Effect{
 constructor(ctx,o={}){super(ctx,'compressor',o);this.processor=this.node(ctx.createDynamicsCompressor());this.makeup=this.node(ctx.createGain());this.processor.knee.value=12;this.inlet.connect(this.processor).connect(this.makeup).connect(this.outlet);this.configure(this.values);this.configure(o.params);}
 update(k){const v=this.values[k];if(k==='makeup')smooth(this.makeup.gain,dbToGain(v),this.context);else smooth(this.processor[k],k==='attack'||k==='release'?v/1000:v,this.context);}
 get reduction(){return this.processor.reduction;}
}
export class Overdrive extends Effect{
 constructor(ctx,o={}){super(ctx,'overdrive',o);this.shape=this.node(ctx.createWaveShaper());this.shape.oversample='4x';this.tone=this.node(ctx.createBiquadFilter());this.tone.type='lowpass';this.level=this.node(ctx.createGain());this.inlet.connect(this.shape).connect(this.tone).connect(this.level).connect(this.outlet);this.configure(this.values);this.configure(o.params);}
 update(k){if(k==='drive'){const amount=1+this.values.drive*.45,curve=new Float32Array(8193);for(let i=0;i<curve.length;i++)curve[i]=Math.tanh((i*2/(curve.length-1)-1)*amount)/Math.tanh(amount);this.shape.curve=curve;}else if(k==='tone')smooth(this.tone.frequency,this.values.tone,this.context);else smooth(this.level.gain,dbToGain(this.values.level),this.context);}
}
export class Equalizer extends Effect{
 constructor(ctx,o={}){super(ctx,'eq',o);this.low=this.node(ctx.createBiquadFilter());this.low.type='lowshelf';this.low.frequency.value=120;this.mid=this.node(ctx.createBiquadFilter());this.mid.type='peaking';this.mid.Q.value=.8;this.high=this.node(ctx.createBiquadFilter());this.high.type='highshelf';this.high.frequency.value=3500;this.inlet.connect(this.low).connect(this.mid).connect(this.high).connect(this.outlet);this.configure(this.values);this.configure(o.params);}
 update(k){smooth(k==='frequency'?this.mid.frequency:this[k].gain,this.values[k],this.context);}
}
class MixedEffect extends Effect{
 setupMix(){this.clean=this.node(this.context.createGain());this.effectMix=this.node(this.context.createGain());this.inlet.connect(this.clean).connect(this.outlet);this.effectMix.connect(this.outlet);}
 mix(){smooth(this.clean.gain,1-this.values.mix/100,this.context);smooth(this.effectMix.gain,this.values.mix/100,this.context);}
}
export class Chorus extends MixedEffect{
 constructor(ctx,o={}){super(ctx,'chorus',o);this.setupMix();this.delay=this.node(ctx.createDelay(.1));this.delay.delayTime.value=.018;this.lfo=this.node(ctx.createOscillator());this.mod=this.node(ctx.createGain());this.lfo.connect(this.mod).connect(this.delay.delayTime);this.inlet.connect(this.delay).connect(this.effectMix);this.lfo.start();this.sources.push(this.lfo);this.configure(this.values);this.configure(o.params);}
 update(k){if(k==='mix')this.mix();else smooth(k==='rate'?this.lfo.frequency:this.mod.gain,this.values[k]/(k==='depth'?1000:1),this.context);}
}
export class Delay extends MixedEffect{
 constructor(ctx,o={}){super(ctx,'delay',o);this.setupMix();this.delay=this.node(ctx.createDelay(2));this.feedback=this.node(ctx.createGain());this.filter=this.node(ctx.createBiquadFilter());this.filter.type='lowpass';this.inlet.connect(this.delay).connect(this.filter).connect(this.effectMix);this.filter.connect(this.feedback).connect(this.delay);this.configure(this.values);this.configure(o.params);}
 update(k){if(k==='mix')this.mix();else smooth(k==='time'?this.delay.delayTime:k==='feedback'?this.feedback.gain:this.filter.frequency,this.values[k]/(k==='time'?1000:k==='feedback'?100:1),this.context);}
}
export function syntheticImpulse(ctx,seconds=2.4,cabinet=false){const b=ctx.createBuffer(cabinet?1:2,Math.max(1,Math.floor(ctx.sampleRate*seconds)),ctx.sampleRate);let seed=813;for(let ch=0;ch<b.numberOfChannels;ch++){const a=b.getChannelData(ch);let low=0;for(let i=0;i<a.length;i++){seed=(seed*1664525+1013904223)>>>0;const n=seed/2147483648-1;low+=.22*(n-low);a[i]=(cabinet?low:n)*Math.exp(-7*i/a.length)*(cabinet?.12:.3);}if(cabinet)a[0]+=.65;}return b;}
export class Reverb extends MixedEffect{
 constructor(ctx,o={}){super(ctx,'reverb',o);this.setupMix();this.convolver=this.node(ctx.createConvolver());this.tone=this.node(ctx.createBiquadFilter());this.tone.type='lowpass';this.inlet.connect(this.convolver).connect(this.tone).connect(this.effectMix);this.convolver.buffer=syntheticImpulse(ctx,this.values.decay);this.configure(o.params);this.update('mix');this.update('tone');}
 update(k){if(k==='mix')this.mix();else if(k==='tone')smooth(this.tone.frequency,this.values.tone,this.context);else{clearTimeout(this.timer);this.timer=setTimeout(()=>{if(!this.disposed)this.convolver.buffer=syntheticImpulse(this.context,this.values.decay);},180);}}
}
export class Cabinet extends Effect{
 constructor(ctx,o={}){super(ctx,'cabinet',o);this.low=this.node(ctx.createBiquadFilter());this.low.type='highpass';this.high=this.node(ctx.createBiquadFilter());this.high.type='lowpass';this.conv=this.node(ctx.createConvolver());this.conv.normalize=false;this.level=this.node(ctx.createGain());this.inlet.connect(this.low).connect(this.conv).connect(this.high).connect(this.level).connect(this.outlet);this.useBuiltIn();this.configure(this.values);this.configure(o.params);}
 update(k){smooth(k==='lowcut'?this.low.frequency:k==='highcut'?this.high.frequency:this.level.gain,k==='level'?dbToGain(this.values.level):this.values[k],this.context);}
 useBuiltIn(){this.conv.buffer=syntheticImpulse(this.context,.035,true);this.irName='Studio filter · synthetic';this.irId=null;}
 async loadIR(data,{name='Custom IR',id=null}={}){const b=await this.context.decodeAudioData(data.slice(0));if(b.duration>5)throw new Error('Choose a cabinet IR no longer than 5 seconds.');if(![1,2].includes(b.numberOfChannels))throw new Error('Choose a mono or stereo IR.');this.conv.buffer=b;this.irName=name;this.irId=id;return this;}
 serialize(){return{...super.serialize(),irName:this.irName,irId:this.irId};}
}
const constructors={gate:NoiseGate,compressor:Compressor,overdrive:Overdrive,eq:Equalizer,chorus:Chorus,delay:Delay,reverb:Reverb,cabinet:Cabinet};
export async function createEffect(ctx,type,o={}){if(!Object.hasOwn(constructors,type))throw new Error(`Unknown effect: ${type}`);if(type==='gate')await initialize(ctx);return new constructors[type](ctx,o);}
export function validatePreset(p){if(!p||p.version!==1||!Array.isArray(p.order)||p.order.length!==8||new Set(p.order).size!==8||p.order.some(k=>!Object.hasOwn(EFFECTS,k)))throw new Error('Invalid preset order or version.');if(!p.effects||Object.keys(p.effects).length!==8)throw new Error('Preset must include all eight effects.');for(const k of p.order){const e=p.effects[k];if(!e||typeof e.enabled!=='boolean'||!e.params||Object.keys(e.params).length!==Object.keys(EFFECTS[k].params).length)throw new Error(`Invalid ${k} settings.`);for(const[key,v]of Object.entries(e.params)){const s=EFFECTS[k].params[key];if(!s||typeof v!=='number'||!Number.isFinite(v)||v<s.min||v>s.max)throw new Error(`Invalid ${k}.${key}.`);}}return p;}
export class Pedalboard{
 static async create(ctx){await initialize(ctx);return new Pedalboard(ctx);}
 constructor(ctx){this.context=ctx;this.effects=Object.fromEntries(Object.entries(constructors).map(([k,C])=>[k,new C(ctx,{enabled:!['overdrive','chorus','delay'].includes(k)})]));this.order=Object.keys(constructors);this.input=ctx.createGain();this.output=ctx.createGain();this.dry=ctx.createGain();this.wet=ctx.createGain();this.dry.gain.value=0;this.bypassed=false;this.input.connect(this.dry).connect(this.output);this.wet.connect(this.output);this.rewire();}
 rewire(){if(this.first)this.input.disconnect(this.first);Object.values(this.effects).forEach(e=>e.disconnect());this.first=this.effects[this.order[0]].input;this.input.connect(this.first);for(let i=0;i<this.order.length;i++)this.effects[this.order[i]].output.connect(i===this.order.length-1?this.wet:this.effects[this.order[i+1]].input);}
 setOrder(order){if(!Array.isArray(order)||order.length!==8||new Set(order).size!==8||order.some(k=>!Object.hasOwn(this.effects,k)))throw new Error('Order must contain each effect exactly once.');this.order=[...order];this.rewire();return this;}
 setBypassed(v){this.bypassed=!!v;smooth(this.dry.gain,this.bypassed?1:0,this.context);smooth(this.wet.gain,this.bypassed?0:1,this.context);}
 serialize(){return{version:1,order:[...this.order],effects:Object.fromEntries(Object.entries(this.effects).map(([k,e])=>[k,e.serialize()]))};}
 applyPreset(p){validatePreset(p);this.setOrder(p.order);for(const[k,v]of Object.entries(p.effects)){this.effects[k].configure(v.params);this.effects[k].setEnabled(v.enabled);}return this;}
 dispose(){Object.values(this.effects).forEach(e=>e.dispose());[this.input,this.output,this.wet,this.dry].forEach(n=>n.disconnect());}
}
