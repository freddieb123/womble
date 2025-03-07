import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { CheckCircle, Brain, Zap, Award, Users, Server, Database, BarChart, LogOut, CameraIcon } from "lucide-react";

import { Helmet } from "react-helmet";

import { motion } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"; // Added import

export default function LandingPage() {
  const { user, logoutMutation } = useAuth();
  
  // Structured data for rich snippets
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "Womble",
    "applicationCategory": "EducationalApplication",
    "offers": {
      "@type": "Offer",
      "price": "8.00",
      "priceCurrency": "GBP"
    },
    "description": "Womble provides bespoke formative feedback for education and training through AI-powered activities.",
    "operatingSystem": "Web"
  };

  return (
    <div className="min-h-screen flex flex-col landing-page-font">
      <Helmet>
        <script type="application/ld+json">
          {JSON.stringify(structuredData)}
        </script>
      </Helmet>
      {/* Navigation */}
      <nav className="border-b bg-white py-4 px-4 md:px-8">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <span className="text-2xl font-bold text-primary flex items-center cursor-pointer">
                  <img src="/Womble_new_logo_full.png" alt="Womble Logo" className="h-20 w-50 mr-2" />
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-72 p-3">
                <div className="space-y-2">
                  <h4 className="font-bold">Womble</h4>
                  <p className="text-sm">
                    <span className="font-italic text-muted-foreground">noun</span>
                    <br />
                    A fictional animal inhabiting Wimbledon Common in London, characterised as clearing up litter.
                  </p>
                  <p className="text-sm">
                    <span className="font-italic text-muted-foreground">verb (informal)</span>
                    <br />
                    Wander in a casual or relaxed way.
                    <br />
                    <span className="italic">"once we'd arrived back in Cambridge, we wombled quietly home"</span>
                  </p>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="font-medium text-gray-600 hover:text-primary">Features</a>
            <a href="#how-it-works" className="font-medium text-gray-600 hover:text-primary">How It Works</a>
            <a href="#pricing" className="font-medium text-gray-600 hover:text-primary">Pricing</a>
          </div>
          <div className="flex items-center gap-4">
            {user ? (
              <>
                <Button 
                  variant="outline" 
                  className="hidden md:inline-flex" 
                  onClick={() => window.location.href = "/dashboard"}
                >
                  Dashboard
                </Button>
                <Button 
                  className="bg-red-500 hover:bg-red-600 flex items-center gap-2" 
                  onClick={() => logoutMutation.mutate()}
                >
                  <LogOut className="h-4 w-4" />
                  <span>Logout</span>
                </Button>
              </>
            ) : (
              <>
                <Button 
                  variant="outline" 
                  className="hidden md:inline-flex" 
                  onClick={() => window.location.href = "/auth?mode=login"}
                >
                  Log In
                </Button>
                <Button 
                  className="bg-primary hover:bg-primary/90" 
                  onClick={() => window.location.href = "/auth?mode=register"}
                >
                  Get Started
                </Button>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="bg-gradient-to-b from-blue-50 to-white py-20 px-4 md:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-center gap-12">
            <div className="md:w-1/2">
              <h1 className="text-4xl md:text-5xl font-bold text-gray-900 leading-tight">
                Timely, bespoke feedback.
              </h1>
              <p className="mt-6 text-xl text-gray-600">
                Built by teachers, for teachers. Leverage AI in your sessions to give high quality formative feedback to your particpants.
              </p>
              <div className="mt-10 flex flex-col sm:flex-row gap-4">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ 
                    type: "spring", 
                    stiffness: 400, 
                    damping: 10, 
                    delay: 0.3 
                  }}
                >
                  <Button 
                    size="lg" 
                    className="bg-primary hover:bg-primary/90 w-full sm:w-auto"
                    onClick={() => window.location.href = user ? "/dashboard" : "/auth?mode=register"}
                  >
                    {user ? "Go to Dashboard" : "Start Creating"}
                  </Button>
                </motion.div>
                <a href="#how-it-works">
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ 
                      type: "spring", 
                      stiffness: 400, 
                      damping: 10, 
                      delay: 0.5 
                    }}
                  >
                    <Button size="lg" variant="outline" className="w-full sm:w-auto">
                      See How It Works
                    </Button>
                  </motion.div>
                </a>
              </div>
              <div className="mt-8 flex items-center gap-2 text-gray-500">
                <CheckCircle className="h-5 w-5 text-green-400" />
                <span>No payment card required</span>
              </div>
            </div>
            <div className="md:w-1/2 mt-12 md:mt-0">
              <div className="relative">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-primary to-purple-600 rounded-lg blur opacity-30"></div>
                <div className="bg-white p-6 rounded-lg shadow-xl relative">
                  <img 
                    src="/images/top_image.png" 
                    alt="Conversation Demo" 
                    className="rounded-md w-full"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4 md:px-8 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900">Powerful AI Feedback Features</h2>
            <p className="mt-4 text-xl text-gray-600 max-w-3xl mx-auto">
              Provide personalized formative feedback to all your participants, every time.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-10">
            <div className="p-6 rounded-lg border border-gray-100 bg-white shadow-sm">
              <div className="h-12 w-12 rounded-lg bg-green-100 flex items-center justify-center mb-6">
                <Zap className="h-6 w-6 text-green-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900">Bespoke feedack</h3>
              <p className="mt-4 text-gray-600">
                Each of your particpants gets bespoke feedback based on their responses and your assessment criteria.
              </p>
            </div>

            <div className="p-6 rounded-lg border border-gray-100 bg-white shadow-sm">
              <div className="h-12 w-12 rounded-lg bg-blue-100 flex items-center justify-center mb-6">
                <Award className="h-6 w-6 text-blue-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900">Leaderboards</h3>
              <p className="mt-4 text-gray-600">
                Participants can see how they compare to others in the live session.
              </p>
            </div>

            <div className="p-6 rounded-lg border border-gray-100 bg-white shadow-sm">
              <div className="h-12 w-12 rounded-lg bg-purple-100 flex items-center justify-center mb-6">
                <Brain className="h-6 w-6 text-purple-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900">Trainer view</h3>
              <p className="mt-4 text-gray-600">
                Get insights that help you adapt your session on the fly.
              </p>
            </div>


          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-20 px-4 md:px-8 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900">How It Works</h2>
            <p className="mt-4 text-xl text-gray-600 max-w-3xl mx-auto">
              Create and share activities with a magic wand (and a few clicks).
            </p>
          </div>

          <div className="relative">
            <div className="hidden md:block absolute left-1/2 top-0 h-full w-0.5 bg-gray-200 -translate-x-1/2"></div>

            <div className="space-y-16 relative">
              <div className="flex flex-col md:flex-row gap-8 items-center">
                <div className="md:w-1/2 order-2 md:order-1">
                  <div className="relative">
                    <div className="absolute -inset-0.5 bg-gradient-to-r from-primary to-purple-600 rounded-lg blur opacity-20"></div>
                    <div className="bg-white p-4 rounded-lg shadow-md relative">
                      <img 
                        src="/images/1.2 screenshot.png" 
                        alt="Create Activity" 
                        className="rounded-md w-full"
                      />
                    </div>
                  </div>
                </div>
                <div className="md:w-1/2 order-1 md:order-2 relative">
                  
                  <div className="md:pl-8">
                    
                    <h3 className="text-2xl font-bold text-gray-900 md:text-left text-center">1. Create Your Activity and Feedback Criteria</h3>
                    <p className="mt-4 text-gray-600 md:text-left text-center">
                      Activity types include quizzes, screenshot uploads and practice conversations. Create clear and specific feedback criteria.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col md:flex-row gap-8 items-center">
                <div className="md:w-1/2 order-2">
                  <div className="relative">
                   
                    <div className="bg-white p-4 rounded-lg shadow-md relative">
                      <img 
                        src="/images/screenshot 2.2.png" 
                        alt="Share Quiz" 
                        className="rounded-md w-full"
                      />
                    </div>
                  </div>
                </div>
                <div className="md:w-1/2 order-1 relative">
                  {/* Removed the original number on the left */}
                  <div className="md:pl-8">
                    <div className="flex items-start mb-4">
                      <h3 className="text-2xl font-bold text-gray-900 md:text-left">2. Share with your Participants</h3>
                    </div>
                    <p className="mt-4 text-gray-600 md:text-left text-center">
                      Generate a unique link to share in the chat for each session your run. Participants can get hints and feedback.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col md:flex-row gap-8 items-center">
                <div className="md:w-1/2 order-2 md:order-1">
                  <div className="relative">
                    <div className="absolute -inset-0.5 bg-gradient-to-r from-primary to-purple-600 rounded-lg blur opacity-20"></div>
                    <div className="bg-white p-4 rounded-lg shadow-md relative">
                      <img 
                        src="/images/3.1 screenshot.png" 
                        alt="Conversation Analysis" 
                        className="rounded-md w-full"
                      />
                    </div>
                  </div>
                </div>
                <div className="md:w-1/2 order-1 md:order-2 relative">
                  
                  <div className="md:pl-8">
                    
                    <h3 className="text-2xl font-bold text-gray-900 md:text-left text-center">3. Your particpants get feedback</h3>
                    <p className="mt-4 text-gray-600 md:text-left text-center">
                      Review key feedback themes to inform your session.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col md:flex-row gap-8 items-center">
                <div className="md:w-1/2 order-2">
                  <div className="relative">
                    
                    <div className="bg-white p-4 rounded-lg shadow-md relative">
                      <img 
                        src="/images/3 screenshot.png" 
                        alt="Womble class analysis dashboard showing key feedback themes for educators" 
                        className="rounded-md w-full"
                        loading="lazy"
                      />
                    </div>
                  </div>
                </div>
                <div className="md:w-1/2 order-1 relative">
                  <div className="md:pl-8">
                    <div className="flex items-start mb-4">
                        <h3 className="text-2xl font-bold text-gray-900 md:text-left">4. You get a class analysis</h3>
                    </div>
                    <p className="mt-4 text-gray-600 md:text-left text-center">
                      Review key feedback themes to inform your session.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        

        
      </section>

      {/* Types of Activities Section */}
      <section id="activity-types" className="py-20 px-4 md:px-8 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900">Interactive Learning Activities</h2>
            <p className="mt-4 text-xl text-gray-600 max-w-3xl mx-auto">
              Choose from different activity formats to engage your participants with personalized feedback
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-10">
            <div className="p-6 rounded-lg border border-gray-100 bg-white shadow-sm hover:shadow-md transition-shadow">
              <div className="h-12 w-12 rounded-lg bg-blue-100 flex items-center justify-center mb-6">
                <BarChart className="h-6 w-6 text-blue-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900">Quiz</h3>
              <p className="mt-4 text-gray-600">
                Create interactive quizzes with free-text answers. Set clear assessment criteria to guide the AI in creating helpful feedback. 
              </p>
            </div>

            <div className="p-6 rounded-lg border border-gray-100 bg-white shadow-sm hover:shadow-md transition-shadow">
              <div className="h-12 w-12 rounded-lg bg-green-100 flex items-center justify-center mb-6">
                <Users className="h-6 w-6 text-green-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900">Conversation</h3>
              <p className="mt-4 text-gray-600">
                Practice conversations with an AI and get feedback. Perfect for role-playing scenarios and communication skills development.
              </p>
            </div>

            <div className="p-6 rounded-lg border border-gray-100 bg-white shadow-sm hover:shadow-md transition-shadow">
              <div className="h-12 w-12 rounded-lg bg-purple-100 flex items-center justify-center mb-6">
                <CameraIcon className="h-6 w-6 text-purple-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900">Screenshot</h3>
              <p className="mt-4 text-gray-600">
                Upload screenshots for analysis and feedback based on your criteria. Great for reviewing documents or notes from participants.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 px-4 md:px-8 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900">Simple, Transparent Pricing</h2>
            <p className="mt-4 text-xl text-gray-600 max-w-3xl mx-auto">
              Choose the Womble plan that's right for you
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Free Plan */}
            <div className="border border-gray-200 rounded-xl p-8 bg-white relative">
              <h3 className="text-xl font-bold text-gray-900">Free</h3>
              <p className="text-gray-600 mt-2">For occasional use</p>
              <div className="mt-6 mb-8">
                <span className="text-4xl font-bold text-gray-900">$0</span>
                <span className="text-gray-600 ml-2">/month</span>
              </div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-start">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-600">Up to 2 activities</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-600">Unlimited responses</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-600">Teacher analytics</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-600">Access to templates</span>
                </li>
              </ul>
              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => window.location.href = "/auth?mode=register"}
              >
                Sign Up Free
              </Button>
            </div>

            {/* Pro Plan */}
            <div className="border-2 border-primary rounded-xl p-8 bg-white relative shadow-lg">
              <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-primary text-white px-4 py-1 rounded-full text-sm font-medium">
                Most Popular
              </div>
              <h3 className="text-xl font-bold text-gray-900">Pro</h3>
              <p className="text-gray-600 mt-2">For AI evangelists</p>
              <div className="mt-6 mb-8">
                <span className="text-4xl font-bold text-gray-900">£15</span>
                <span className="text-gray-600 ml-2">/month</span>
              </div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-start">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-600">Unlimited quizzes</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-600">Advanced analytics</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-600">Priority AI assistance</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-600">Team collaboration</span>
                </li>
              </ul>
              <Button 
                className="w-full bg-primary hover:bg-primary/90"
                onClick={() => window.location.href = "/auth?mode=register"}
              >
                Get Started
              </Button>
            </div>

            {/* Enterprise Plan */}
            <div className="border border-gray-200 rounded-xl p-8 bg-white relative">
              <h3 className="text-xl font-bold text-gray-900">Enterprise</h3>
              <p className="text-gray-600 mt-2">For organisations</p>
              <div className="mt-6 mb-8">
                <span className="text-4xl font-bold text-gray-900">£99</span>
                <span className="text-gray-600 ml-2">/month</span>
              </div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-start">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-600">Everything in Pro</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-600">Template sharing with the team</span>
                </li>

                <li className="flex items-start">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-600">Dedicated support</span>
                </li>

              </ul>
              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => window.location.href = "/auth?mode=register"}
              >
                Contact Sales
              </Button>
            </div>
          </div>
        </div>
      </section>
      

      {/* CTA Section */}
      <section className="py-20 px-4 md:px-8 bg-white">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900">Ready to Transform Learning?</h2>
          <p className="mt-6 text-xl text-gray-600">
            Join the community of educators who are turbocharging their learning experiences with bespoke feedback.
          </p>
          <div className="mt-10">
            <motion.div
              initial={{ opacity: 0, y: 25 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ 
                type: "spring", 
                stiffness: 400, 
                damping: 8, 
                delay: 0.2 
              }}
              whileHover={{ 
                scale: 1.05, 
                transition: { duration: 0.2 } 
              }}
            >
              <Button 
                size="lg" 
                className="bg-primary hover:bg-primary/90"
                onClick={() => window.location.href = "/auth?mode=register"}
              >
                Get Started for Free
              </Button>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12 px-4 md:px-8 mt-auto">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12">
            <div>
              <div className="flex items-center">
                <span className="text-2xl font-bold text-primary flex items-center">
                  <img src="/Womble_new_logo_full.png" alt="Womble Logo" className="h-14 w-29 mr-2" />
                  
                </span>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-4"></h3>
              <ul className="space-y-2">

              </ul>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-4"></h3>
              <ul className="space-y-2">

              </ul>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-4">Company</h3>
              <ul className="space-y-2">
                <li><a href="#" className="text-gray-400 hover:text-white">Contact Us</a></li>

              </ul>
            </div>
          </div>

          <div className="mt-12 pt-8 border-t border-gray-800 text-center text-gray-400">
            <p>Made with ❤️ by Uncle Bulgaria.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}