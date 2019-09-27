/*---------------------------------------------------------------------------------------------
* Copyright (c) 2019 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
/** @module WebGL */
import { VariableType, ProgramBuilder, FragmentShaderComponent } from "../ShaderBuilder";
import { assert } from "@bentley/bentleyjs-core";
import { TextureUnit } from "../RenderFlags";
import { addUInt32s } from "./Common";
import { addModelMatrix } from "./Vertex";
import { addHiliteSettings } from "./FeatureSymbology";
import { SpatialClassificationProps } from "@bentley/imodeljs-common";

const applyPlanarClassificationColor = `
  const float dimScale = .7;
  const float colorMix = .65;
  vec2 classPos = v_pClassPos.xy / v_pClassPosW;
  if (s_pClassColorParams.x > kClassifierDisplay_Element) { // texture/terrain drape.
    if (classPos.x < 0.0 || classPos.x > 1.0 || classPos.y < 0.0 || classPos.y > 1.0)
      discard;

    vec3 rgb = TEXTURE(s_pClassSampler, classPos.xy).rgb;
    return vec4(rgb, baseColor.a);
  }

  vec4 colorTexel = TEXTURE(s_pClassSampler, vec2(classPos.x, classPos.y / 2.0));
  float isClassified = ceil(colorTexel.a);
  float param = mix(s_pClassColorParams.y, s_pClassColorParams.x, isClassified);
  if (kClassifierDisplay_Off == param)
    return vec4(0.0);
  else if (kClassifierDisplay_On == param)
    return baseColor;
  else if (0.0 == isClassified || kClassifierDisplay_Dimmed == param)
    return vec4(baseColor.rgb * dimScale, 1.0);
  else if (kClassifierDisplay_Hilite == param)
    return vec4(mix(baseColor.rgb, u_hilite_color.rgb, u_hilite_settings.x), 1.0);

  // black indicates discard (clip masking).
  if (0.0 == colorTexel.r && 0.0 == colorTexel.g && 0.0 == colorTexel.b)
    discard;

  // NB: colorTexel contains pre-multiplied alpha. We know it is greater than zero from above.
  float alpha = colorTexel.a;
  vec3 rgb = colorTexel.rgb / alpha;
  rgb = mix(baseColor.rgb, rgb * baseColor.rgb, colorMix);
  return vec4(rgb, alpha);
`;

const overrideFeatureId = `
  if (s_pClassColorParams.x > kClassifierDisplay_Element) return currentId;
  vec2 classPos = v_pClassPos.xy / v_pClassPosW;
  vec4 featureTexel = TEXTURE(s_pClassSampler, vec2(classPos.x, (1.0 + classPos.y) / 2.0));
  return (featureTexel == vec4(0)) ? currentId : addUInt32s(u_batchBase, featureTexel * 255.0) / 255.0;
  `;

const computeClassifiedSurfaceHiliteColor = `
  vec2 classPos = v_pClassPos.xy / v_pClassPosW;
  vec4 hiliteTexel = TEXTURE(s_pClassHiliteSampler, classPos);
  if (hiliteTexel.a > 0.5 && isSurfaceBitSet(kSurfaceBit_HasTexture))
    return vec4(TEXTURE(s_texture, v_texCoord).a > 0.15 ? 1.0 : 0.0);
  else
  return vec4(hiliteTexel.a > 0.5 ? 1.0 : 0.0);
`;

const computeClassifiedSurfaceHiliteColorNoTexture = `
  vec2 classPos = v_pClassPos.xy / v_pClassPosW;
  vec4 hiliteTexel = TEXTURE(s_pClassHiliteSampler, classPos.xy);
  return vec4(hiliteTexel.a > 0.5 ? 1.0 : 0.0);
`;

const computeClassifierPos = "vec4 classProj = u_pClassProj * MAT_MODEL * rawPosition; v_pClassPos.xy = classProj.xy;";
const computeClassifierPosW = "v_pClassPosW = classProj.w;";

const scratchBytes = new Uint8Array(4);
const scratchBatchBaseId = new Uint32Array(scratchBytes.buffer);
const scratchBatchBaseComponents = [0, 0, 0, 0];
const scratchColorParams = new Float32Array(2);      // Unclassified scale, classified base scale, classified classifier scale.

function addPlanarClassifierCommon(builder: ProgramBuilder) {
  const vert = builder.vert;
  vert.addUniform("u_pClassProj", VariableType.Mat4, (prog) => {
    prog.addGraphicUniform("u_pClassProj", (uniform, params) => {
      const source = params.target.currentPlanarClassifierOrDrape!;
      assert(undefined !== source);
      uniform.setMatrix4(source.projectionMatrix);
    });
  });

  addModelMatrix(vert);
  builder.addInlineComputedVarying("v_pClassPos", VariableType.Vec2, computeClassifierPos);
  builder.addInlineComputedVarying("v_pClassPosW", VariableType.Float, computeClassifierPosW);

  const frag = builder.frag;
  frag.addDefine("kClassifierDisplay_Off", SpatialClassificationProps.Display.Off.toFixed(1));
  frag.addDefine("kClassifierDisplay_On", SpatialClassificationProps.Display.On.toFixed(1));
  frag.addDefine("kClassifierDisplay_Dimmed", SpatialClassificationProps.Display.Dimmed.toFixed(1));
  frag.addDefine("kClassifierDisplay_Hilite", SpatialClassificationProps.Display.Hilite.toFixed(1));
  frag.addDefine("kClassifierDisplay_Element", SpatialClassificationProps.Display.ElementColor.toFixed(1));
}

/** @internal */
export function addColorPlanarClassifier(builder: ProgramBuilder) {
  addPlanarClassifierCommon(builder);
  const vert = builder.vert;
  addModelMatrix(vert);

  const frag = builder.frag;
  frag.addUniform("s_pClassSampler", VariableType.Sampler2D, (prog) => {
    prog.addGraphicUniform("s_pClassSampler", (uniform, params) => {
      const source = params.target.currentPlanarClassifierOrDrape!;
      assert(undefined !== source.texture);
      source.texture!.texture.bindSampler(uniform, TextureUnit.PlanarClassification);
    });
  });

  frag.addUniform("s_pClassColorParams", VariableType.Vec2, (prog) => {
    prog.addGraphicUniform("s_pClassColorParams", (uniform, params) => {
      const source = params.target.currentPlanarClassifierOrDrape!;
      source.getParams(scratchColorParams);
      uniform.setUniform2fv(scratchColorParams);
    });
  });

  addHiliteSettings(frag);
  frag.set(FragmentShaderComponent.ApplyPlanarClassifier, applyPlanarClassificationColor);
}

/** @internal */
export function addFeaturePlanarClassifier(builder: ProgramBuilder) {
  const frag = builder.frag;
  frag.addUniform("u_batchBase", VariableType.Vec4, (prog) => {     // TBD.  Instancing.
    prog.addGraphicUniform("u_batchBase", (uniform, params) => {
      const classifier = params.target.currentPlanarClassifier;
      if (classifier !== undefined) {
        scratchBatchBaseId[0] = classifier.baseBatchId;
        scratchBatchBaseComponents[0] = scratchBytes[0];
        scratchBatchBaseComponents[1] = scratchBytes[1];
        scratchBatchBaseComponents[2] = scratchBytes[2];
        scratchBatchBaseComponents[3] = scratchBytes[3];
      }
      uniform.setUniform4fv(scratchBatchBaseComponents);
    });
  });
  frag.set(FragmentShaderComponent.OverrideFeatureId, overrideFeatureId);
  frag.addFunction(addUInt32s);
}

/** @internal */
export function addHilitePlanarClassifier(builder: ProgramBuilder, supportTextures = true) {
  const frag = builder.frag;
  frag.addUniform("s_pClassHiliteSampler", VariableType.Sampler2D, (prog) => {
    prog.addGraphicUniform("s_pClassHiliteSampler", (uniform, params) => {
      const classifier = params.target.currentPlanarClassifier!;
      assert(undefined !== classifier && undefined !== classifier.hiliteTexture);
      classifier.hiliteTexture!.texture.bindSampler(uniform, TextureUnit.PlanarClassificationHilite);
    });
  });

  frag.set(FragmentShaderComponent.ComputeBaseColor, supportTextures ? computeClassifiedSurfaceHiliteColor : computeClassifiedSurfaceHiliteColorNoTexture);
}
