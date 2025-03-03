import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { CheckCircle, Brain, Zap, Award, Users, Server, Database, BarChart, LogOut } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";

export default function LandingPage() {
  const { user, logoutMutation } = useAuth();
  return (
    <div className="min-h-screen flex flex-col">
      {/* Navigation */}
      <nav className="border-b bg-white py-4 px-4 md:px-8">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center">
            <span className="text-2xl font-bold text-primary flex items-center">
              <img src="/womble-logo.png" alt="Womble Logo" className="h-10 w-10 mr-2" />
              Womble
            </span>
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
      <section className="py-20 px-4 md:px-8 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col lg:flex-row items-center gap-12">
            <div className="lg:w-1/2 space-y-8">
              <div className="flex items-center gap-4 mb-6">
                <img src="/womble-logo-icon.png" alt="Womble Logo" className="h-12 w-12" />
                <h1 className="text-3xl font-bold text-gray-900">Womble</h1>
              </div>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-gray-900">
                Create AI-Powered Learning <span className="text-primary">Quizzes</span> in Seconds
              </h1>
              <p className="text-xl text-gray-600">
                Engage learners with interactive quizzes, get instant feedback, and track progress with artificial intelligence.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
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
              <div className="mt-8 flex items-center gap-2 text-gray-600">
                <CheckCircle className="h-5 w-5 text-green-500" />
                <span>No credit card required</span>
              </div>
            </div>
            <div className="md:w-1/2 mt-12 md:mt-0">
              <div className="relative">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-primary to-purple-600 rounded-lg blur opacity-30"></div>
                <div className="bg-white p-6 rounded-lg shadow-xl relative">
                  <img 
                    src="https://placehold.co/600x400/e9f0fd/1a56db?text=AI-Powered+Quiz+Platform" 
                    alt="Quiz Platform Demo" 
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
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900">Powerful Features</h2>
            <p className="mt-4 text-xl text-gray-600 max-w-3xl mx-auto">
              Everything you need to create, manage, and analyze AI-powered interactive quizzes
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-10">
            <div className="p-6 rounded-lg border border-gray-100 bg-white shadow-sm">
              <div className="h-12 w-12 rounded-lg bg-blue-100 flex items-center justify-center mb-6">
                <Brain className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900">AI-Generated Content</h3>
              <p className="mt-4 text-gray-600">
                Create high-quality quiz questions with AI assistance, saving time and ensuring educational value.
              </p>
            </div>

            <div className="p-6 rounded-lg border border-gray-100 bg-white shadow-sm">
              <div className="h-12 w-12 rounded-lg bg-green-100 flex items-center justify-center mb-6">
                <Zap className="h-6 w-6 text-green-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900">Dynamic Quizzes</h3>
              <p className="mt-4 text-gray-600">
                Create interactive quizzes with various question types and difficulty levels to engage learners.
              </p>
            </div>

            <div className="p-6 rounded-lg border border-gray-100 bg-white shadow-sm">
              <div className="h-12 w-12 rounded-lg bg-purple-100 flex items-center justify-center mb-6">
                <BarChart className="h-6 w-6 text-purple-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900">Performance Analytics</h3>
              <p className="mt-4 text-gray-600">
                Track student progress and identify areas for improvement with detailed analytics.
              </p>
            </div>

            <div className="p-6 rounded-lg border border-gray-100 bg-white shadow-sm">
              <div className="h-12 w-12 rounded-lg bg-orange-100 flex items-center justify-center mb-6">
                <Users className="h-6 w-6 text-orange-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900">Collaborative Learning</h3>
              <p className="mt-4 text-gray-600">
                Enable teams to learn together with shared quizzes and leaderboards to foster friendly competition.
              </p>
            </div>

            <div className="p-6 rounded-lg border border-gray-100 bg-white shadow-sm">
              <div className="h-12 w-12 rounded-lg bg-red-100 flex items-center justify-center mb-6">
                <Award className="h-6 w-6 text-red-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900">Instant Feedback</h3>
              <p className="mt-4 text-gray-600">
                Provide learners with immediate, intelligent feedback to enhance the learning process.
              </p>
            </div>

            <div className="p-6 rounded-lg border border-gray-100 bg-white shadow-sm">
              <div className="h-12 w-12 rounded-lg bg-gray-100 flex items-center justify-center mb-6">
                <Database className="h-6 w-6 text-gray-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900">Quiz Templates</h3>
              <p className="mt-4 text-gray-600">
                Access a library of pre-built quiz templates to quickly create and customize quizzes.
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
              Create, share and analyze AI-powered quizzes in just a few simple steps
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
                        src="https://placehold.co/500x300/e9f0fd/1a56db?text=Create+Quiz" 
                        alt="Create Quiz" 
                        className="rounded-md w-full"
                      />
                    </div>
                  </div>
                </div>
                <div className="md:w-1/2 order-1 md:order-2 relative">
                  <div className="hidden md:flex absolute -left-12 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-primary text-white items-center justify-center font-bold text-xl shadow-lg">1</div>
                  <div className="md:pl-8">
                    <div className="md:hidden flex h-10 w-10 rounded-full bg-primary text-white items-center justify-center font-bold text-xl shadow-lg mb-4 mx-auto">1</div>
                    <h3 className="text-2xl font-bold text-gray-900 md:text-left text-center">Create Your Quiz</h3>
                    <p className="mt-4 text-gray-600 md:text-left text-center">
                      Choose from templates or start from scratch. Our AI will help you generate high-quality questions or you can create your own.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col md:flex-row gap-8 items-center">
                <div className="md:w-1/2 order-2">
                  <div className="relative">
                    <div className="absolute -inset-0.5 bg-gradient-to-r from-primary to-purple-600 rounded-lg blur opacity-20"></div>
                    <div className="bg-white p-4 rounded-lg shadow-md relative">
                      <img 
                        src="https://placehold.co/500x300/e9f0fd/1a56db?text=Share+Quiz" 
                        alt="Share Quiz" 
                        className="rounded-md w-full"
                      />
                    </div>
                  </div>
                </div>
                <div className="md:w-1/2 order-1 relative">
                  <div className="hidden md:flex absolute -left-12 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-primary text-white items-center justify-center font-bold text-xl shadow-lg">2</div>
                  <div className="md:pl-8">
                    <div className="md:hidden flex h-10 w-10 rounded-full bg-primary text-white items-center justify-center font-bold text-xl shadow-lg mb-4 mx-auto">2</div>
                    <h3 className="text-2xl font-bold text-gray-900 md:text-left text-center">Share with Students</h3>
                    <p className="mt-4 text-gray-600 md:text-left text-center">
                      Generate a link to your quiz and share it with your students or team. No accounts needed for quiz takers.
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
                        src="https://placehold.co/500x300/e9f0fd/1a56db?text=Review+Results" 
                        alt="Review Results" 
                        className="rounded-md w-full"
                      />
                    </div>
                  </div>
                </div>
                <div className="md:w-1/2 order-1 md:order-2 relative">
                  <div className="hidden md:flex absolute -left-12 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-primary text-white items-center justify-center font-bold text-xl shadow-lg">3</div>
                  <div className="md:pl-8">
                    <div className="md:hidden flex h-10 w-10 rounded-full bg-primary text-white items-center justify-center font-bold text-xl shadow-lg mb-4 mx-auto">3</div>
                    <h3 className="text-2xl font-bold text-gray-900 md:text-left text-center">Analyze Results</h3>
                    <p className="mt-4 text-gray-600 md:text-left text-center">
                      Review detailed analytics to understand performance, identify knowledge gaps, and gain insights for improved learning outcomes.
                    </p>
                  </div>
                </div>
              </div>
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
                  <span className="text-gray-600">5 quizzes per month</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-600">Basic analytics</span>
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
              <p className="text-gray-600 mt-2">For educators & teams</p>
              <div className="mt-6 mb-8">
                <span className="text-4xl font-bold text-gray-900">$29</span>
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
              <p className="text-gray-600 mt-2">For organizations</p>
              <div className="mt-6 mb-8">
                <span className="text-4xl font-bold text-gray-900">$99</span>
                <span className="text-gray-600 ml-2">/month</span>
              </div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-start">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-600">Everything in Pro</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-600">Custom integrations</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-600">Dedicated support</span>
                </li>
                <li className="flex items-start">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-600">Custom branding</span>
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

      {/* Testimonials */}
      <section className="py-20 px-4 md:px-8 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900">What Users Say</h2>
            <p className="mt-4 text-xl text-gray-600 max-w-3xl mx-auto">
              Educators and organizations love our AI-powered quiz platform
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <motion.div 
              className="bg-white p-6 rounded-lg shadow-sm border border-gray-100"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.5 }}
              whileHover={{ y: -5, transition: { duration: 0.2 } }}
            >
              <div className="flex items-center mb-4">
                <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-primary font-bold">
                  JD
                </div>
                <div className="ml-4">
                  <h4 className="font-semibold text-gray-900">Jane Doe</h4>
                  <p className="text-sm text-gray-600">High School Teacher</p>
                </div>
              </div>
              <p className="text-gray-600">
                "QuizAI has transformed how I assess my students. The AI-generated questions are high-quality and save me hours of preparation time."
              </p>
            </motion.div>

            <motion.div 
              className="bg-white p-6 rounded-lg shadow-sm border border-gray-100"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              whileHover={{ y: -5, transition: { duration: 0.2 } }}
            >
              <div className="flex items-center mb-4">
                <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center text-green-600 font-bold">
                  MS
                </div>
                <div className="ml-4">
                  <h4 className="font-semibold text-gray-900">Mark Smith</h4>
                  <p className="text-sm text-gray-600">Corporate Trainer</p>
                </div>
              </div>
              <p className="text-gray-600">
                "The analytics provided by QuizAI help me identify knowledge gaps in my team and tailor training accordingly. It's been invaluable for our L&D department."
              </p>
            </motion.div>

            <motion.div 
              className="bg-white p-6 rounded-lg shadow-sm border border-gray-100"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.5 }}
              whileHover={{ y: -5, transition: { duration: 0.2 } }}
            >
              <div className="flex items-center mb-4">
                <div className="h-10 w-10 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 font-bold">
                  AJ
                </div>
                <div className="ml-4">
                  <h4 className="font-semibold text-gray-900">Alex Johnson</h4>
                  <p className="text-sm text-gray-600">University Professor</p>
                </div>
              </div>
              <p className="text-gray-600">
                "My students love the interactive nature of the quizzes and the immediate feedback. I've seen a significant improvement in engagement and retention."
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 md:px-8 bg-white">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900">Ready to Transform Learning?</h2>
          <p className="mt-6 text-xl text-gray-600">
            Join thousands of educators and organizations using QuizAI to create engaging, effective learning experiences.
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
                <Brain className="h-8 w-8 mr-2" />
                <span className="text-2xl font-bold">QuizAI</span>
              </div>
              <p className="mt-4 text-gray-400">
                AI-powered quiz platform for enhanced learning experiences.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-4">Product</h3>
              <ul className="space-y-2">
                <li><a href="#features" className="text-gray-400 hover:text-white">Features</a></li>
                <li><a href="#pricing" className="text-gray-400 hover:text-white">Pricing</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white">Templates</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white">Integrations</a></li>
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-4">Resources</h3>
              <ul className="space-y-2">
                <li><a href="#" className="text-gray-400 hover:text-white">Documentation</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white">Blog</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white">Case Studies</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white">Support</a></li>
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-4">Company</h3>
              <ul className="space-y-2">
                <li><a href="#" className="text-gray-400 hover:text-white">About Us</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white">Careers</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white">Privacy Policy</a></li>
                <li><a href="#" className="text-gray-400 hover:text-white">Terms of Service</a></li>
              </ul>
            </div>
          </div>

          <div className="mt-12 pt-8 border-t border-gray-800 text-center text-gray-400">
            <p>© {new Date().getFullYear()} Womble. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}