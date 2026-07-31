import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronRight } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';
import {
  Card,
  Header,
  Plan,
  PlanName,
  Badge,
  Price,
  MainPrice,
  Period,
  OriginalPrice,
  Body,
  List,
  ListItem,
} from '../ui/pricing-card';

const plans = {
  monthly: [
    { name: 'Essential', price: '99', period: '/mo', features: ['Sales Pipeline', 'Core analytics', '2 live integrations', 'Churn monitoring'], cta: 'Unlock Access', featured: false, planId: 'essential_monthly' },
    { name: 'Pro', price: '149', period: '/mo', features: ['Everything in Essential', '4 live integrations', 'CSV import', 'AI insights', 'CRO analysis', 'Revenue forecasting', 'Priority support'], cta: 'Scale Up', featured: true, planId: 'pro_monthly' },
    { name: 'Enterprise', price: '400', period: '/mo', features: ['Everything in Pro', 'Unlimited integrations', 'Custom API access', 'Smart Assist AI', 'Revenue Intelligence', 'Competitor Intelligence'], cta: 'Maximise', featured: false, planId: 'enterprise_monthly' }
  ],
  yearly: [
    { name: 'Essential', price: '830', originalPrice: '1,188', period: '/yr', features: ['Sales Pipeline', 'Core analytics', '2 live integrations', 'Churn monitoring'], cta: 'Unlock Access', featured: false, planId: 'essential_yearly', savings: 'Save 30%' },
    { name: 'Pro', price: '1,250', originalPrice: '1,788', period: '/yr', features: ['Everything in Essential', '4 live integrations', 'CSV import', 'AI insights', 'CRO analysis', 'Revenue forecasting', 'Priority support'], cta: 'Scale Up', featured: true, planId: 'pro_yearly', savings: 'Save 30%' },
    { name: 'Enterprise', price: '3,360', originalPrice: '4,800', period: '/yr', features: ['Everything in Pro', 'Unlimited integrations', 'Custom API access', 'Smart Assist AI', 'Revenue Intelligence', 'Competitor Intelligence'], cta: 'Maximise', featured: false, planId: 'enterprise_yearly', savings: 'Save 30%' }
  ]
};

export const PricingSection = ({ handleGetStarted, isAuthenticated }) => {
  const navigate = useNavigate();
  const [billingPeriod, setBillingPeriod] = useState('monthly');

  const handlePlanClick = (plan) => {
    navigate(`/checkout?plan=${plan.planId}`);
  };

  return (
    <section id="pricing" className="py-24 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12 reveal">
          <span className="text-zinc-400 text-sm font-medium uppercase tracking-widest">Pricing</span>
          <h2 className="mt-4 text-3xl sm:text-4xl font-bold text-white" style={{ fontFamily: 'Outfit' }}>Unlock full access</h2>
          <p className="mt-4 text-zinc-400">Start growing. Scale as you need.</p>
          <div className="mt-8 inline-flex items-center p-1 bg-white/[0.04] rounded-full border border-white/10 backdrop-blur-md relative" data-testid="billing-toggle">
            <div
              className="absolute top-1 bottom-1 rounded-full bg-white/15 border border-white/20 backdrop-blur-sm transition-all duration-400 ease-[cubic-bezier(0.16,1,0.3,1)]"
              style={{
                width: 'calc(50% - 4px)',
                left: billingPeriod === 'monthly' ? '4px' : 'calc(50%)',
              }}
            />
            <button onClick={() => setBillingPeriod('monthly')}
              className={`relative z-10 w-28 py-2 rounded-full text-sm font-medium text-center transition-colors duration-300 ${billingPeriod === 'monthly' ? 'text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
              data-testid="billing-monthly-btn">Monthly</button>
            <button onClick={() => setBillingPeriod('yearly')}
              className={`relative z-10 w-28 py-2 rounded-full text-sm font-medium text-center transition-colors duration-300 ${billingPeriod === 'yearly' ? 'text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
              data-testid="billing-yearly-btn">Yearly</button>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-8 items-stretch max-w-5xl mx-auto">
          {plans[billingPeriod].map((plan, i) => (
            <Card key={i} featured={plan.featured} data-testid={`pricing-card-${plan.name.toLowerCase()}`}>
              <Header>
                <Plan>
                  <PlanName>
                    {plan.name}
                  </PlanName>
                  {plan.savings && (
                    <Badge className="border-emerald-400/30 bg-emerald-500/10 text-emerald-300">{plan.savings}</Badge>
                  )}
                </Plan>
                <Price>
                  <MainPrice>${plan.price}</MainPrice>
                  {plan.originalPrice && <OriginalPrice>${plan.originalPrice}</OriginalPrice>}
                  <Period>{plan.period}</Period>
                </Price>
              </Header>
              <Body>
                <List className="flex-1">
                  {plan.features.map((feature, j) => (
                    <ListItem key={j}>
                      <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-white/10 border border-white/20">
                        <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
                      </span>
                      {feature}
                    </ListItem>
                  ))}
                </List>
                <Button
                  className={cn(
                    'w-full mt-6',
                    plan.featured
                      ? 'bg-white/10 text-white hover:bg-white/20'
                      : 'bg-white/10 text-white border border-white/15 hover:bg-white/20 backdrop-blur-sm',
                  )}
                  onClick={() => handlePlanClick(plan)}
                  data-testid={`pricing-cta-${plan.name.toLowerCase()}`}
                >
                  {plan.cta} <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </Body>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};
