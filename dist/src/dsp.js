/** Pure helpers for metering and monophonic YIN pitch detection. */
export const dbToGain=db=>10**(db/20);
export const gainToDb=g=>20*Math.log10(Math.max(1e-6,g));
export const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
export function levels(a){let sum=0,peak=0;for(const s of a){sum+=s*s;peak=Math.max(peak,Math.abs(s));}return{rms:Math.sqrt(sum/Math.max(1,a.length)),peak};}
export function detectPitch(a,sr,minHz=65,maxHz=1400){if(levels(a).rms<.004)return null;const half=Math.floor(a.length/2),max=Math.min(half-1,Math.ceil(sr/minHz)),min=Math.max(2,Math.floor(sr/maxHz)),d=new Float32Array(max+1);let total=0;for(let t=1;t<=max;t++){let sum=0;for(let i=0;i<half;i++){const x=a[i]-a[i+t];sum+=x*x;}total+=sum;d[t]=total?sum*t/total:1;}for(let t=min;t<max;t++){if(d[t]<.14){while(t+1<max&&d[t+1]<d[t])t++;const x=d[t-1],y=d[t],z=d[t+1],shift=(x-z)/(2*(x-2*y+z)||1);return{frequency:sr/(t+clamp(shift,-1,1)),confidence:1-y};}}return null;}
export function noteFromFrequency(f,ref=440){const n=69+12*Math.log2(f/ref),m=Math.round(n);return{midi:m,name:['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'][(m%12+12)%12],octave:Math.floor(m/12)-1,cents:(n-m)*100};}
