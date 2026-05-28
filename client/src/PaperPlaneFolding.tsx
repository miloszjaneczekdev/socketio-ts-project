import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";



type Fold = {
  A: THREE.Vector3;
  B: THREE.Vector3;
  sideSign: number;
  angle: number;
};

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

// Rodrigues rotation: rotate point P around axis passing through A with unit direction axisUnit by angle
function rotateAroundAxis(
  P: THREE.Vector3,
  A: THREE.Vector3,
  axisUnit: THREE.Vector3,
  angle: number
) {
  const x = P.x - A.x,
    y = P.y - A.y,
    z = P.z - A.z;
  const ux = axisUnit.x,
    uy = axisUnit.y,
    uz = axisUnit.z;

  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dot = ux * x + uy * y + uz * z;

  const rx = x * cos + (uy * z - uz * y) * sin + ux * dot * (1 - cos);
  const ry = y * cos + (uz * x - ux * z) * sin + uy * dot * (1 - cos);
  const rz = z * cos + (ux * y - uy * x) * sin + uz * dot * (1 - cos);

  return new THREE.Vector3(rx + A.x, ry + A.y, rz + A.z);
}

// side test in XY plane (sign of cross(AB, AP))
function sideOfLineXY(A: THREE.Vector3, B: THREE.Vector3, P: THREE.Vector3) {
  const abx = B.x - A.x,
    aby = B.y - A.y;
  const apx = P.x - A.x,
    apy = P.y - A.y;
  return abx * apy - aby * apx;
}

// apply one fold to vertices: rotate those on one side of line AB
function applyFold(
  basePositions: THREE.Vector3[],
  outPositions: THREE.Vector3[],
  A: THREE.Vector3,
  B: THREE.Vector3,
  angle: number,
  sideSign: number
) {
  const axis = new THREE.Vector3(B.x - A.x, B.y - A.y, 0).normalize();

  for (let i = 0; i < basePositions.length; i++) {
    const P = basePositions[i];
    const s = sideOfLineXY(A, B, P);
    outPositions[i] = s * sideSign > 0 ? rotateAroundAxis(P, A, axis, angle) : P.clone();
  }
}

// apply folds sequentially
function applyFoldsSequential(original: THREE.Vector3[], folds: Fold[]) {
  let cur = original.map((v) => v.clone());
  const tmp = new Array<THREE.Vector3>(cur.length);

  for (const f of folds) {
    applyFold(cur, tmp, f.A, f.B, f.angle, f.sideSign);
    cur = tmp.map((v) => v.clone());
  }
  return cur;
}

export default function PaperPlaneFolding() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const stepNames = useMemo(
    () => [
      "Krok 0: Kartka",
      "Krok 1: Prawy górny róg",
      "Krok 2: Lewy górny róg",
      "Krok 3: Złóż na pół",
      "Krok 4: Skrzydła",
      "Krok 5: Lot ✈️",
    ],
    []
  );

  // target fold angles for each step
  const targets = useMemo(
    () => [
      { a1: 0, a2: 0, a3: 0, a4: 0 },
      { a1: -Math.PI * 0.92, a2: 0, a3: 0, a4: 0 },
      { a1: -Math.PI * 0.92, a2: +Math.PI * 0.92, a3: 0, a4: 0 },
      { a1: -Math.PI * 0.92, a2: +Math.PI * 0.92, a3: -Math.PI * 0.97, a4: 0 },
      { a1: -Math.PI * 0.92, a2: +Math.PI * 0.92, a3: -Math.PI * 0.97, a4: +Math.PI * 0.72 },
      { a1: -Math.PI * 0.92, a2: +Math.PI * 0.92, a3: -Math.PI * 0.97, a4: +Math.PI * 0.72 },
    ],
    []
  );

  const [step, setStepState] = useState(0);
  const stepRef = useRef(0);

  const [autoOn, setAutoOn] = useState(false);
  const autoRef = useRef<number | null>(null);

  const flyingRef = useRef(false);

  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // --- renderer / scene / camera ---
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x0b1220, 1);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x0b1220, 6, 20);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 200);
    camera.position.set(0, 1.6, 7.2);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.target.set(0, 0.7, 0);

    // lights
    scene.add(new THREE.HemisphereLight(0x9fb7ff, 0x0b1220, 0.9));

    const key = new THREE.DirectionalLight(0xffffff, 1.05);
    key.position.set(3.5, 5.5, 2.5);
    scene.add(key);

    const rim = new THREE.DirectionalLight(0x90a8ff, 0.45);
    rim.position.set(-4.5, 2.5, -2.5);
    scene.add(rim);

    // ground
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.MeshStandardMaterial({ color: 0x0b1220, roughness: 1, metalness: 0 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    scene.add(ground);

    // --- paper geometry (subdivided plane) ---
    const W = 3.0;
    const H = 4.2;
    const segW = 46;
    const segH = 66;

    const geo = new THREE.PlaneGeometry(W, H, segW, segH);
    geo.translate(0, H * 0.15, 0);

    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.92,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });

    const paper = new THREE.Mesh(geo, mat);
    paper.rotation.x = -0.15;
    scene.add(paper);

    const posAttr = geo.attributes.position as THREE.BufferAttribute;

    // original vertex positions
    const original: THREE.Vector3[] = [];
    for (let i = 0; i < posAttr.count; i++) {
      original.push(new THREE.Vector3(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i)));
    }

    // fold lines in local coordinates
    const xL = -W / 2;
    const xR = W / 2;
    const yTop = H / 2 + H * 0.15;
    const yMid = H * 0.15;
    const yBot = -H / 2 + H * 0.15;

    const fold1: Fold = {
      // right top corner
      A: new THREE.Vector3(0.0, yTop, 0),
      B: new THREE.Vector3(xR, yMid + 0.2, 0),
      sideSign: +1,
      angle: 0,
    };

    const fold2: Fold = {
      // left top corner
      A: new THREE.Vector3(0.0, yTop, 0),
      B: new THREE.Vector3(xL, yMid + 0.2, 0),
      sideSign: -1,
      angle: 0,
    };

    const fold3: Fold = {
      // fold in half (x=0)
      A: new THREE.Vector3(0.0, yBot, 0),
      B: new THREE.Vector3(0.0, yTop, 0),
      sideSign: +1,
      angle: 0,
    };

    const wingLineY = yMid + 0.35;
    const fold4: Fold = {
      // wings
      A: new THREE.Vector3(xL, wingLineY, 0),
      B: new THREE.Vector3(xR, wingLineY, 0),
      sideSign: -1,
      angle: 0,
    };

    const folds: Fold[] = [fold1, fold2, fold3, fold4];

    // resize
    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener("resize", resize);

    // smooth approach
    const approach = (cur: number, target: number, speed: number) => cur + (target - cur) * speed;

    let raf = 0;

    const animate = () => {
      raf = requestAnimationFrame(animate);

      controls.update();

      // update fold angles towards target for current step
      const t = targets[stepRef.current];

      fold1.angle = approach(fold1.angle, t.a1, 0.14);
      fold2.angle = approach(fold2.angle, t.a2, 0.14);
      fold3.angle = approach(fold3.angle, t.a3, 0.12);
      fold4.angle = approach(fold4.angle, t.a4, 0.14);

      // re-generate deformed vertices from original each frame
      const newVerts = applyFoldsSequential(original, folds);
      for (let i = 0; i < posAttr.count; i++) {
        posAttr.setXYZ(i, newVerts[i].x, newVerts[i].y, newVerts[i].z);
      }
      posAttr.needsUpdate = true;
      geo.computeVertexNormals();

      // flight when step==5 and flying enabled
      if (stepRef.current === 5 && flyingRef.current) {
        paper.position.x = approach(paper.position.x, 7.5, 0.02);
        paper.position.y = approach(paper.position.y, 3.0, 0.02);
        paper.position.z = approach(paper.position.z, -1.0, 0.02);
        paper.rotation.x = approach(paper.rotation.x, 0.05, 0.02);
        paper.rotation.y = approach(paper.rotation.y, -0.4, 0.02);
        paper.rotation.z = approach(paper.rotation.z, 0.35, 0.02);
      } else {
        // keep base tilt when not flying
        if (stepRef.current < 5) {
          paper.position.set(0, 0, 0);
          paper.rotation.x = approach(paper.rotation.x, -0.15, 0.08);
          paper.rotation.y = approach(paper.rotation.y, 0, 0.08);
          paper.rotation.z = approach(paper.rotation.z, 0, 0.08);
        }
      }

      renderer.render(scene, camera);
    };

    animate();

    // cleanup
    return () => {
      if (autoRef.current) window.clearInterval(autoRef.current);
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(raf);

      controls.dispose();
      geo.dispose();
      mat.dispose();
      (ground.geometry as THREE.BufferGeometry).dispose();
      (ground.material as THREE.Material).dispose();
      renderer.dispose();

      // best effort: remove objects
      scene.clear();
    };
  }, [targets]);

  const setStep = (n: number) => {
    const s = clamp(n, 0, 5);
    setStepState(s);
    stepRef.current = s;

    if (s < 5) {
      flyingRef.current = false;
    }
  };

  const stopAuto = () => {
    if (autoRef.current) {
      window.clearInterval(autoRef.current);
      autoRef.current = null;
    }
    setAutoOn(false);
  };

  const startAuto = () => {
    stopAuto();
    setAutoOn(true);
    autoRef.current = window.setInterval(() => {
      const cur = stepRef.current;
      if (cur >= 5) {
        stopAuto();
        return;
      }
      setStep(cur + 1);
    }, 1100);
  };

  const toggleAuto = () => (autoOn ? stopAuto() : startAuto());

  const onFly = () => {
    setStep(5);
    flyingRef.current = true;
    stopAuto();
  };

  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative", background: "#0b1220" }}>
      <div
        style={{
          position: "fixed",
          top: 14,
          left: 14,
          zIndex: 10,
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
          padding: "10px 12px",
          borderRadius: 14,
          background: "rgba(255,255,255,.08)",
          border: "1px solid rgba(255,255,255,.12)",
          backdropFilter: "blur(10px)",
          color: "#fff",
          boxShadow: "0 10px 30px rgba(0,0,0,.25)",
        }}
      >
        <button onClick={() => setStep(step - 1)} disabled={step === 0}>
          ◀ Cofnij
        </button>
        <button onClick={() => setStep(step + 1)} disabled={step === 5}>
          Dalej ▶
        </button>
        <button onClick={toggleAuto}>{autoOn ? "Stop ⏸" : "Auto ✨"}</button>
        <button
          onClick={() => {
            stopAuto();
            setStep(0);
          }}
        >
          Reset
        </button>
        <button onClick={onFly}>Lot ✈️</button>
        <span style={{ fontSize: 13, opacity: 0.85, whiteSpace: "nowrap" }}>{stepNames[step]}</span>
      </div>

      <div
        style={{
          position: "fixed",
          bottom: 14,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 10,
          color: "rgba(255,255,255,.75)",
          fontSize: 12,
          padding: "8px 12px",
          borderRadius: 999,
          background: "rgba(255,255,255,.06)",
          border: "1px solid rgba(255,255,255,.10)",
          backdropFilter: "blur(10px)",
        }}
      >
        Mysz: obracaj, scroll: zoom (OrbitControls). Kroki: prawy róg → lewy róg → na pół → skrzydła → lot.
      </div>

      <canvas
        ref={canvasRef}
        onClick={() => {
          if (stepRef.current < 5) setStep(stepRef.current + 1);
          else setStep(0);
        }}
        style={{ width: "100%", height: "100%", display: "block" }}
      />
    </div>
  );
}
