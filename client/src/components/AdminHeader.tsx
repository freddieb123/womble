
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { Link } from "wouter";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

interface AdminHeaderProps {
  title: string;
  showNewButton?: boolean;
  newButtonText?: string;
  newButtonLink?: string;
}

export default function AdminHeader({ 
  title, 
  showNewButton = true, 
  newButtonText = "New Activity", 
  newButtonLink = "/admin/new" 
}: AdminHeaderProps) {
  return (
    <div className="w-full bg-blue-50 py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <div className="flex items-center gap-2 cursor-pointer">
                <img src="/womble-icon.svg" alt="Womble" className="h-8 w-8" />
                <span className="text-xl font-bold text-green-700">Womble</span>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-72 p-3">
              <div className="space-y-2">
                <h4 className="font-bold">Womble</h4>
                <p className="text-sm">
                  <span className="font-italic text-muted-foreground">noun</span>
                  <br />
                  A fictional animal inhabiting Wimbledon Common in London, characterized as clearing up litter.
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
          
          <h1 className="text-2xl font-bold text-primary">{title}</h1>
          
          <div className="flex items-center gap-4">
            {showNewButton && (
              <Link href={newButtonLink}>
                <Button className="bg-purple-600 hover:bg-purple-700">
                  <Plus className="h-5 w-5 mr-2" />
                  {newButtonText}
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
