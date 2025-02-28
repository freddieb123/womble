import { Switch, Route } from "wouter";
import Home from "./pages/Home";
import UserView from "./pages/UserView";
import ConversationAnalysis from "./pages/ConversationAnalysis";
import StaticConversationView from "./pages/StaticConversationView";
import AuthPage from "./pages/auth-page";
import ResetPasswordPage from "./pages/reset-password-page";
import LandingPage from "./pages/LandingPage";
import { AuthProvider } from "./hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { ProtectedRoute } from "./lib/protected-route";

function App() {
  return (
    <AuthProvider>
      <Switch>
        <Route path="/" component={LandingPage} />
        <Route path="/auth" component={AuthPage} />
        <Route path="/reset-password" component={ResetPasswordPage} />
        <ProtectedRoute path="/dashboard" component={Home} />
        <Route path="/chat" component={UserView} />
        <ProtectedRoute path="/analysis" component={ConversationAnalysis} />
        <Route path="/conversation" component={StaticConversationView} />
        <Route component={NotFound} />
      </Switch>
    </AuthProvider>
  );
}

function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <h1 className="text-2xl font-bold text-gray-900">404 Page Not Found</h1>
          </div>
          <p className="mt-4 text-sm text-gray-600">
            The requested page could not be found.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default App;