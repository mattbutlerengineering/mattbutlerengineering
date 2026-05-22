import { Hero, Stack, Button, Text } from "@mattbutlerengineering/rialto";

export function HeroSection() {
  const scrollToProjects = () => {
    document.getElementById("projects")?.scrollIntoView({ behavior: "smooth" });
  };

  const scrollToAbout = () => {
    document.getElementById("about")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <Hero
      eyebrow="Engineering Leader"
      title={
        <>
          One-person team. <Text className="accent">Full ownership.</Text>
        </>
      }
      subtitle="Designing, building, shipping, and operating production systems — from component library to cloud infrastructure."
      minHeight="90vh"
      actions={
        <Stack direction="row" gap="md">
          <Button variant="primary" size="lg" onClick={scrollToProjects}>
            See my work
          </Button>
          <Button variant="ghost" size="lg" onClick={scrollToAbout}>
            About me
          </Button>
        </Stack>
      }
    />
  );
}
