import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import AdminHeader from "@/components/AdminHeader";
import { useNavigate } from "react-router-dom";


function AdminPage() {
  const navigate = useNavigate();

  return (
    <div>
      <AdminHeader title="Admin Home" />
      <main className="p-4">
        {/* Admin page content here */}
        <Button
          onClick={() => navigate("/admin/new")}
          className="bg-purple-600 hover:bg-purple-700"
        >
          <Plus className="h-5 w-5 mr-2" />
          New GPT
        </Button>
      </main>
    </div>
  );
}

export default AdminPage;


//AdminHeader Component
import React from 'react';
import { Avatar } from "@/components/ui/avatar";


const AdminHeader = ({ title }) => {
  return (
    <div className="w-full bg-blue-50 py-6 flex items-center justify-between px-4 sm:px-6 lg:px-8">
      <div className="flex items-center">
        <Avatar src="/user-image.jpg" alt="Admin Profile" className="mr-4" /> {/* Example image path */}
        <h1 className="text-2xl font-bold text-primary">{title}</h1>
      </div>
      <div>
        {/* Add additional buttons or elements here if needed */}
      </div>
    </div>
  );
};

export default AdminHeader;