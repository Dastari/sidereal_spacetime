import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { Scene } from "@babylonjs/core/scene";
export function voxelPlanetMaterial(scene: Scene, name: string, cloud = false) {
  const mat = new ShaderMaterial(
    name,
    scene,
    {
      vertexSource: `
precision highp float;
attribute vec3 position;attribute vec3 normal;attribute vec4 color;
uniform mat4 world;uniform mat4 worldViewProjection;
varying vec3 vNormal;varying vec3 vRadial;varying vec3 vWorld;varying vec4 vColor;
void main(){vNormal=normalize(mat3(world)*normal);vRadial=normalize(mat3(world)*position);vColor=color;vWorld=(world*vec4(position,1.)).xyz;gl_Position=worldViewProjection*vec4(position,1.);}
`,
      fragmentSource: `
precision highp float;
varying vec3 vNormal;varying vec3 vRadial;varying vec3 vWorld;varying vec4 vColor;
uniform vec3 cameraPosition;uniform float cloud;uniform float emission;
void main(){
 vec3 light=normalize(vec3(-.65,.7,-.45));
 float globe=dot(vRadial,light),face=dot(vNormal,light);
 float daylight=smoothstep(-.2,.5,globe);
 float shade=(.14+daylight*.69)*(.73+max(face,0.)*.37);
 vec3 color=vColor.rgb*shade;
 color+=vColor.rgb*vec3(.19,.16,.36)*(1.-daylight);
 float rim=pow(1.-max(dot(vRadial,normalize(cameraPosition-vWorld)),0.),4.);
 color+=vec3(.17,.32,.7)*rim*daylight*.3;
 color+=vColor.rgb*vColor.a*emission;
 gl_FragColor=vec4(color,1.);
}`,
    },
    {
      attributes: ["position", "normal", "color"],
      uniforms: [
        "world",
        "worldViewProjection",
        "cameraPosition",
        "cloud",
        "emission",
      ],
    },
  );
  mat.setFloat("cloud", cloud ? 1 : 0);
  mat.setFloat("emission", 0);
  return mat;
}
