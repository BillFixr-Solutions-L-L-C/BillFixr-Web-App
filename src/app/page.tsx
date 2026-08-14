import Navbar from "@/components/landing/Navbar";
import Hero from "@/components/landing/Hero";
import HowItWorks from "@/components/landing/HowItWorks";
import WhyChooseUs from "@/components/landing/WhyChooseUs";
import BeforeYouPay from "@/components/landing/BeforeYouPay";
import CTABanner from "@/components/landing/CTABanner";
import Testimonials from "@/components/landing/Testimonials";
import FAQ from "@/components/landing/FAQ";
import Footer from "@/components/landing/Footer";

export default function Home() {
  return (
    <main className="flex-1">
      <div className="bg-gradient-to-b from-primary-100 via-primary-50 to-primary-50">
        <Navbar />
        <Hero />
      </div>
      <HowItWorks />
      <WhyChooseUs />
      <BeforeYouPay />
      <CTABanner />
      <Testimonials />
      <FAQ />
      <Footer />
    </main>
  );
}
