
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { Link } from "wouter";

interface AdminHeaderProps {
  title: string;
  showNewButton?: boolean;
  newButtonText?: string;
  newButtonLink?: string;
}

export default function AdminHeader({ 
  title, 
  showNewButton = true, 
  newButtonText = "New GPT", 
  newButtonLink = "/admin/new" 
}: AdminHeaderProps) {
  return (
    <div className="w-full bg-blue-50 py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <img src="/Womble_new_logo_full.png" alt="Womble Logo" className="h-8 w-8" />
            <span className="text-xl font-bold text-primary"></span>
          </div>
          
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
