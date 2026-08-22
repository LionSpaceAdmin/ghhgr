import LionParticleScene from "../components/LionParticleScene";

export default function HomePage() {
  return (
    <main className="demoShell">
      <LionParticleScene />
      <div className="srOnly">
        A luminous lion assembled from tens of thousands of GPU-rendered particles and structural line segments.
      </div>
    </main>
  );
}
