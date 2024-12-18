import { Switch, Route } from "wouter";
import Home from "./pages/Home";
import UserView from "./pages/UserView";
import ConversationAnalysis from "./pages/ConversationAnalysis";

function App() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/chat" component={UserView} />
      <Route path="/analysis" component={ConversationAnalysis} />
    </Switch>
  );
}

export default App;
