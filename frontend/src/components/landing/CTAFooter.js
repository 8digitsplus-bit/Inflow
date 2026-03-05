import { ArrowRight, Zap } from 'lucide-react';
import { Button } from '../ui/button';

export const CTASection = ({ handleGetStarted }) => (
  <section className="py-24 px-4 sm:px-6 lg:px-8">
    <div className="max-w-4xl mx-auto text-center">
      <div className="relative">
        <div className="absolute inset-0 hero-glow" />
        <div className="relative bg-zinc-900/50 border border-white/10 rounded-3xl p-12 backdrop-blur">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4" style={{ fontFamily: 'Outfit' }}>
            Ready to optimize your pricing?
          </h2>
          <p className="text-zinc-400 mb-8 max-w-xl mx-auto">
            Start optimizing your pricing and accelerate revenue growth today.
          </p>
          <Button size="lg" className="bg-indigo-600 hover:bg-indigo-500 btn-glow px-8 group" onClick={handleGetStarted} data-testid="cta-final-btn">
            Access Now <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </Button>
        </div>
      </div>
    </div>
  </section>
);

export const Footer = () => (
  <footer className="border-t border-white/10 py-12 px-4 sm:px-6 lg:px-8">
    <div className="max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <span className="font-semibold text-white" style={{ fontFamily: 'Outfit' }}>Vector</span>
        </div>
        <div className="flex items-center gap-8 text-sm text-zinc-400">
          <a href="#" className="hover:text-white transition-colors">Privacy</a>
          <a href="#" className="hover:text-white transition-colors">Terms</a>
          <a href="#" className="hover:text-white transition-colors">Contact</a>
        </div>
        <p className="text-sm text-zinc-500">&copy; 2026 Vector. All rights reserved.</p>
      </div>
    </div>
  </footer>
);
