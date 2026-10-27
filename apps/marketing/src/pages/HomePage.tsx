import { HeroSection } from "../components/HeroSection";
import { ProofStrip } from "../components/ProofStrip";
import { ProjectsSection } from "../components/ProjectsSection";
import { FactorySection } from "../components/factory/FactorySection";
import { ReadingSection } from "../components/ReadingSection";
import { ContactSection } from "../components/ContactSection";
import { weeklyResources } from "../data/weekly-intake";
import { recentReadingItems } from "../data/weekly-freshness";

export function HomePage() {
  return (
    <>
      <HeroSection />
      <ProofStrip />
      <ProjectsSection />
      <FactorySection />
      <ReadingSection items={recentReadingItems(weeklyResources)} />
      <ContactSection />
    </>
  );
}
