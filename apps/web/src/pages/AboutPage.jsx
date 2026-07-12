
import React, { useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { TrendingUp, ArrowRight, Sparkles } from 'lucide-react';
import DemoVideoCard from '@/components/DemoVideoCard.jsx';
const AboutPage = () => {
  useEffect(() => {
    // ScrollToTop globally yanks the page to top on route change, so an in-URL
    // #demo hash gets clobbered. Re-honor it after mount.
    if (window.location.hash === '#demo') {
      setTimeout(() => {
        document.getElementById('demo')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 80);
    }
  }, []);

  return (
    <>
      <Helmet>
        <title>About - kaushalstack</title>
        <meta name="description" content="Learn about kaushalstack's mission to build a free, open-source community for skill sharing and collaborative learning." />
      </Helmet>

      <div className="min-h-screen">
        <section className="py-20 bg-gradient-to-br from-background via-muted/30 to-background">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full mb-6">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Our Mission</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mb-6 leading-tight" style={{ letterSpacing: '-0.02em' }}>
              Building the future of{' '}
              <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                collaborative learning
              </span>
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed max-w-3xl mx-auto">
              kaushalstack is a free, open-source platform where anyone can share their skills, learn from others, and contribute to a growing knowledge base. We believe in the power of community-driven education and collaborative growth.
            </p>
          </div>
        </section>

        {/* Demo videos — newest first. #demo anchor lands on the latest one. */}
        <section id="demo" className="py-12 sm:py-16 -mt-6">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-6">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary/10 rounded-full mb-3">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-semibold text-primary uppercase tracking-widest">Latest · Card Studio</span>
              </div>
              <h2 className="text-2xl md:text-3xl font-bold mb-2">See kaushalstack in action</h2>
              <p className="text-sm text-muted-foreground max-w-xl mx-auto">
                Card Studio in action with our partner Mr n Mr — swap photos, remix captions with AI, and download platform-ready social cards.
              </p>
            </div>
            <DemoVideoCard src="/card-studio-demo.mp4" poster="/card-studio-poster.jpg" duration="5 min" />

            <div className="text-center mt-14 mb-6">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-muted rounded-full mb-3">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">June 14</span>
              </div>
              <p className="text-sm text-muted-foreground max-w-xl mx-auto">
                Maya designs the mockups, Ananya builds the production website from her design system, you download the ZIP.
              </p>
            </div>
            <DemoVideoCard src="/demo-jun14.mp4" poster="/demo-jun14-poster.jpg" duration="2 min" />
          </div>
        </section>


        <section className="py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
              <div className="order-2 md:order-1">
                <div className="bg-gradient-to-br from-primary/10 to-accent/10 rounded-2xl p-8 text-center">
                  <TrendingUp className="w-16 h-16 text-primary mx-auto mb-4" />
                  <h3 className="text-2xl font-bold mb-2">Future expansion</h3>
                  <p className="text-muted-foreground">
                    We're planning to expand beyond skill sharing into banking, financial literacy, and more community-driven services
                  </p>
                </div>
              </div>
              <div className="order-1 md:order-2">
                <h2 className="text-3xl font-bold mb-4">Growing together</h2>
                <p className="text-muted-foreground leading-relaxed mb-6">
                  Our vision extends beyond just skill sharing. We're building an ecosystem where community members can access financial services, educational resources, and collaborative tools — all while maintaining our commitment to being free and open source.
                </p>
                <p className="text-muted-foreground leading-relaxed">
                  Join us in shaping the future of community-driven platforms. Whether you're here to learn, teach, or contribute to the codebase, there's a place for you in the kaushalstack community.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="py-20 bg-gradient-to-br from-primary to-accent text-white">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              Ready to join the community?
            </h2>
            <p className="text-lg mb-8 text-white/90 leading-relaxed max-w-2xl mx-auto">
              Start sharing your skills, learning from others, and contributing to the future of collaborative education today.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/signup">
                <Button size="lg" variant="secondary" className="gap-2">
                  Get Started Free
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
              <Link to="/skills">
                <Button size="lg" variant="outline" className="bg-white/10 border-white/20 text-white hover:bg-white/20">
                  Browse Skills
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </div>
    </>
  );
};

export default AboutPage;
