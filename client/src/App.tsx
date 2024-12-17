import { Switch, Route } from "wouter";
import Home from "./pages/Home";
import UserView from "./pages/UserView";

function App() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/chat" component={UserView} />
    </Switch>
  );
}

export default App;
