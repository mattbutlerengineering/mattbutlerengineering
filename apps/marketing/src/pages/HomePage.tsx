import { Button, Card, CardHeader, CardTitle, CardDescription, CardContent } from "@mbe/ui";

export function HomePage() {
  return (
    <div>
      {/* Hero Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto text-center">
          <h1 className="text-5xl font-bold mb-6">
            Building Software That Matters
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            Full-stack engineering solutions designed with care. From concept to
            production, we build reliable, scalable applications.
          </p>
          <div className="flex gap-4 justify-center">
            <Button size="lg">Get Started</Button>
            <Button variant="outline" size="lg">
              Learn More
            </Button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4 bg-gray-50">
        <div className="container mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">What We Do</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <Card>
              <CardHeader>
                <CardTitle>Web Applications</CardTitle>
                <CardDescription>
                  Modern, responsive web apps built with React and TypeScript
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600">
                  From dashboards to customer-facing products, we build web
                  applications that scale.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>API Development</CardTitle>
                <CardDescription>
                  RESTful and GraphQL APIs with solid architecture
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600">
                  Well-documented, tested, and performant APIs that power your
                  applications.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>DevOps & Infrastructure</CardTitle>
                <CardDescription>
                  CI/CD, containerization, and cloud deployments
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600">
                  Automated pipelines and infrastructure as code for reliable
                  deployments.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </div>
  );
}
