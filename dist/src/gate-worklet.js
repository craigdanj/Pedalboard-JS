/** Stereo-linked envelope gate with hysteresis and smooth gain. */
class GateProcessor extends AudioWorkletProcessor{
 static get parameterDescriptors(){return[{name:'threshold',defaultValue:-48,minValue:-80,maxValue:-10,automationRate:'k-rate'},{name:'attack',defaultValue:3,minValue:.2,maxValue:30,automationRate:'k-rate'},{name:'release',defaultValue:120,minValue:10,maxValue:600,automationRate:'k-rate'}];}
 constructor(){super();this.envelope=0;this.gain=0;this.open=false;}
 process(inputs,outputs,p){const input=inputs[0],output=outputs[0];if(!input?.length){output.forEach(c=>c.fill(0));return true;}const threshold=10**(p.threshold[0]/20),attack=Math.exp(-1/(sampleRate*p.attack[0]/1000)),release=Math.exp(-1/(sampleRate*p.release[0]/1000)),envRelease=Math.exp(-1/(sampleRate*.015));for(let i=0;i<output[0].length;i++){let peak=0;for(const c of input)peak=Math.max(peak,Math.abs(c[i]||0));this.envelope=peak>this.envelope?peak:envRelease*this.envelope+(1-envRelease)*peak;if(this.envelope>threshold)this.open=true;else if(this.envelope<threshold*.65)this.open=false;const target=this.open?1:0,coeff=target>this.gain?attack:release;this.gain=target+(this.gain-target)*coeff;for(let c=0;c<output.length;c++)output[c][i]=(input[c]||input[0])[i]*this.gain;}return true;}
}
registerProcessor('pedalboard-gate',GateProcessor);
