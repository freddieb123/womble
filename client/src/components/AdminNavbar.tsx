import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { LogOut, Plus } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";

interface AdminNavbarProps {
  title: string;
  showNewButton?: boolean;
  newButtonText?: string;
  newButtonLink?: string;
  onNewButtonClick?: () => void;
}

export default function AdminNavbar({ 
  title, 
  showNewButton = true, 
  newButtonText = "New Activity", 
  newButtonLink = "#",
  onNewButtonClick
}: AdminNavbarProps) {
  const { user, logoutMutation } = useAuth();
  
  const handleLogout = () => {
    logoutMutation.mutate();
  };

  // Get initials for avatar fallback
  const getInitials = (): string => {
    if (!user) return "U";
    
    // If there's a firstName, use initials from firstName and lastName
    if (user.firstName) {
      const firstName = user.firstName || "";
      const lastName = user.lastName || "";
      return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() || "U";
    } 
    
    // Otherwise use the first letter of the email
    if (user.email) {
      return user.email.charAt(0).toUpperCase();
    }
    
    return "U"; // Fallback for any other case
  };

  return (
    <div className="w-full border-b bg-card">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 justify-between items-center">
          {/* Logo and Name - Left aligned */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <div className="flex items-center gap-2 cursor-pointer rounded-md px-1 py-1 hover:bg-accent transition-colors">
                <img src="/womble-icon.svg" alt="Womble" className="h-10 w-10" />
                <span className="text-xl font-bold text-primary">Womble</span>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-72 p-3">
              <div className="space-y-2">
                <h4 className="font-bold">Womble</h4>
                <p className="text-sm">
                  <span className="italic text-muted-foreground">noun</span>
                  <br />
                  A fictional animal inhabiting Wimbledon Common in London, characterized as clearing up litter.
                </p>
                <p className="text-sm">
                  <span className="italic text-muted-foreground">verb (informal)</span>
                  <br />
                  Wander in a casual or relaxed way.
                  <br />
                  <span className="italic">"once we'd arrived back in Cambridge, we wombled quietly home"</span>
                </p>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
          
          {/* Page Title - Center aligned, hidden on mobile */}
          <h1 className="text-lg font-semibold text-foreground hidden md:block">{title}</h1>
          
          {/* New Agent Button and User Profile - Right aligned */}
          <div className="flex items-center gap-4">
            {showNewButton && (
              newButtonLink === "#" && onNewButtonClick ? (
                <Button 
                  onClick={onNewButtonClick}
                >
                  <Plus className="h-5 w-5 mr-2" />
                  {newButtonText}
                </Button>
              ) : (
                <Link href={newButtonLink}>
                  <Button>
                    <Plus className="h-5 w-5 mr-2" />
                    {newButtonText}
                  </Button>
                </Link>
              )
            )}
            
            {/* User Profile */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Avatar className="cursor-pointer">
                  <AvatarFallback className="bg-primary text-primary-foreground">
                    {getInitials()}
                  </AvatarFallback>
                </Avatar>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem className="cursor-pointer" onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Logout</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </div>
  );
}
