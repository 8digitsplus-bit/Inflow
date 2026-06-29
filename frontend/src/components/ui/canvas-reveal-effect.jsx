import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { cn } from '../../lib/utils';

/**
 * CanvasRevealEffect — animated WebGL dot-matrix reveal.
 *
 * Rendered with vanilla three.js (NOT @react-three/fiber) on purpose: the dev
 * visual-edits babel plugin injects metadata props into every JSX element,
 * which R3F's reconciler rejects when they land on three.js objects. Driving
 * three.js imperatively avoids that entirely while keeping the identical shader.
 */
export const CanvasRevealEffect = ({
  animationSpeed = 10,
  opacities = [0.3, 0.3, 0.3, 0.5, 0.5, 0.5, 0.8, 0.8, 0.8, 1],
  colors = [[0, 255, 255]],
  containerClassName,
  dotSize = 3,
  showGradient = true,
  reverse = false,
}) => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);

    const scene = new THREE.Scene();
    const camera = new THREE.Camera(); // identity matrices; vertex shader writes clip-space directly

    // Build the 6-slot colour palette the same way the original did.
    let colorsArray = [colors[0], colors[0], colors[0], colors[0], colors[0], colors[0]];
    if (colors.length === 2) colorsArray = [colors[0], colors[0], colors[0], colors[1], colors[1], colors[1]];
    else if (colors.length === 3) colorsArray = [colors[0], colors[0], colors[1], colors[1], colors[2], colors[2]];

    const uniforms = {
      u_time: { value: 0 },
      u_opacities: { value: opacities },
      u_colors: { value: colorsArray.map((c) => new THREE.Vector3(c[0] / 255, c[1] / 255, c[2] / 255)) },
      u_total_size: { value: 20 },
      u_dot_size: { value: dotSize },
      u_resolution: { value: new THREE.Vector2(1, 1) },
      u_reverse: { value: reverse ? 1 : 0 },
    };

    const material = new THREE.ShaderMaterial({
      vertexShader: `
        precision mediump float;
        uniform vec2 u_resolution;
        out vec2 fragCoord;
        void main(){
          gl_Position = vec4(position.x, position.y, 0.0, 1.0);
          fragCoord = (position.xy + vec2(1.0)) * 0.5 * u_resolution;
          fragCoord.y = u_resolution.y - fragCoord.y;
        }`,
      fragmentShader: `
        precision mediump float;
        in vec2 fragCoord;

        uniform float u_time;
        uniform float u_opacities[10];
        uniform vec3 u_colors[6];
        uniform float u_total_size;
        uniform float u_dot_size;
        uniform vec2 u_resolution;
        uniform int u_reverse;

        out vec4 fragColor;

        float PHI = 1.61803398874989484820459;
        float random(vec2 xy) {
            return fract(tan(distance(xy * PHI, xy) * 0.5) * xy.x);
        }

        void main() {
            vec2 st = fragCoord.xy;
            st.x -= abs(floor((mod(u_resolution.x, u_total_size) - u_dot_size) * 0.5));
            st.y -= abs(floor((mod(u_resolution.y, u_total_size) - u_dot_size) * 0.5));

            float opacity = step(0.0, st.x);
            opacity *= step(0.0, st.y);

            vec2 st2 = vec2(int(st.x / u_total_size), int(st.y / u_total_size));

            float frequency = 5.0;
            float show_offset = random(st2);
            float rand = random(st2 * floor((u_time / frequency) + show_offset + frequency));
            opacity *= u_opacities[int(rand * 10.0)];
            opacity *= 1.0 - step(u_dot_size / u_total_size, fract(st.x / u_total_size));
            opacity *= 1.0 - step(u_dot_size / u_total_size, fract(st.y / u_total_size));

            vec3 color = u_colors[int(show_offset * 6.0)];

            float animation_speed_factor = 0.5;
            vec2 center_grid = u_resolution / 2.0 / u_total_size;
            float dist_from_center = distance(center_grid, st2);
            float timing_offset_intro = dist_from_center * 0.01 + (random(st2) * 0.15);
            float max_grid_dist = distance(center_grid, vec2(0.0, 0.0));
            float timing_offset_outro = (max_grid_dist - dist_from_center) * 0.02 + (random(st2 + 42.0) * 0.2);

            float current_timing_offset;
            if (u_reverse == 1) {
                current_timing_offset = timing_offset_outro;
                opacity *= 1.0 - step(current_timing_offset, u_time * animation_speed_factor);
                opacity *= clamp((step(current_timing_offset + 0.1, u_time * animation_speed_factor)) * 1.25, 1.0, 1.25);
            } else {
                current_timing_offset = timing_offset_intro;
                opacity *= step(current_timing_offset, u_time * animation_speed_factor);
                opacity *= clamp((1.0 - step(current_timing_offset + 0.1, u_time * animation_speed_factor)) * 1.25, 1.0, 1.25);
            }

            fragColor = vec4(color, opacity);
            fragColor.rgb *= fragColor.a;
        }`,
      uniforms,
      glslVersion: THREE.GLSL3,
      transparent: true,
      blending: THREE.CustomBlending,
      blendSrc: THREE.SrcAlphaFactor,
      blendDst: THREE.OneFactor,
    });

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    scene.add(mesh);

    const resize = () => {
      const w = canvas.clientWidth || canvas.parentElement?.clientWidth || window.innerWidth;
      const h = canvas.clientHeight || canvas.parentElement?.clientHeight || window.innerHeight;
      renderer.setSize(w, h, false);
      uniforms.u_resolution.value.set(w * dpr, h * dpr);
    };
    resize();
    window.addEventListener('resize', resize);

    const clock = new THREE.Clock();
    let raf;
    const animate = () => {
      uniforms.u_time.value = clock.getElapsedTime();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      mesh.geometry.dispose();
      material.dispose();
      renderer.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reverse, dotSize, animationSpeed]);

  return (
    <div className={cn('h-full relative w-full', containerClassName)}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      {showGradient && <div className="absolute inset-0 bg-gradient-to-t from-black to-transparent" />}
    </div>
  );
};
