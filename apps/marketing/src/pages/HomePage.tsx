import { HeroSection } from "../components/HeroSection";
import { ProofStrip } from "../components/ProofStrip";
import { ProjectsSection } from "../components/ProjectsSection";
import { FactorySection } from "../components/factory/FactorySection";
import { ContactSection } from "../components/ContactSection";

export function HomePage() {
  return (
    <>
      <HeroSection />
      <ProofStrip />
      <ProjectsSection />
      <FactorySection />
      <ContactSection />
    </>
  );
}
