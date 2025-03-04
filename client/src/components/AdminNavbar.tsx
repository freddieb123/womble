import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { LogOut, Plus, User } from "lucide-react";
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
  newButtonText = "New GPT", 
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
    
    const firstName = user.firstName || "";
    const lastName = user.lastName || "";
    
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() || "U";
  };

  return (
    <div className="w-full bg-blue-50 py-4 border-b border-blue-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center">
          {/* Logo and Name - Left aligned */}
          <div className="flex items-center gap-2">
            <img src="/womble-logo-new.png" alt="Womble Logo" className="h-8 w-8" />
            <span className="text-xl font-bold text-primary">Womble</span>
          </div>
          
          {/* Page Title - Center aligned */}
          <h1 className="text-2xl font-bold text-primary">{title}</h1>
          
          {/* New GPT Button and User Profile - Right aligned */}
          <div className="flex items-center gap-4">
            {showNewButton && (
              newButtonLink === "#" && onNewButtonClick ? (
                <Button 
                  className="bg-purple-600 hover:bg-purple-700" 
                  onClick={onNewButtonClick}
                >
                  <Plus className="h-5 w-5 mr-2" />
                  {newButtonText}
                </Button>
              ) : (
                <Link href={newButtonLink}>
                  <Button className="bg-purple-600 hover:bg-purple-700">
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