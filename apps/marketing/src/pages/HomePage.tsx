import { HeroSection } from "../components/HeroSection";
import { ProjectsSection } from "../components/ProjectsSection";
import { AboutSection } from "../components/AboutSection";
import { ContactSection } from "../components/ContactSection";

export function HomePage() {
  return (
    <>
      <HeroSection />
      <ProjectsSection />
      <AboutSection />
      <ContactSection />
    </>
  );
}
