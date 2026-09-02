import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from '@/api/entities';
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2, ArrowLeft, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { motion } from "framer-motion";

export default function UploadBehaviorPlan() {
  const [user, setUser] = useState(null);
  const [children, setChildren] = useState([]);
  const [selectedChildId, setSelectedChildId] = useState("");
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadStage, setUploadStage] = useState("");
  const [status, setStatus] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const load = async () => {
      const me = await base44.auth.me().catch(() => null);
      if (!me) { navigate("/"); return; }
      setUser(me);
      base44.entities.Child.filter({ clinician_id: me.id }).then(setChildren).catch(() => setChildren([]));
      const urlChildId = new URLSearchParams(window.location.search).get("child_id");
      if (urlChildId) setSelectedChildId(urlChildId);
    };
    load();
  }, []);

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
    setStatus(null);
  };

  const handleUpload = async () => {
    if (!file || !selectedChildId) {
      setStatus({ type: "error", message: "Please select a child and upload a file." });
      return;
    }

    setUploading(true);
    setStatus(null);

    try {
      setUploadStage("Uploading document to secure storage...");
      const { file_url } = await base44.integrations.Core.UploadFile({ file });

      setUploadStage("Saving document record...");
      await base44.entities.Document.create({
        child_id: selectedChildId,
        clinician_id: user.id,
        title: file.name.replace(/\.[^/.]+$/, ""),
        category: "behavior_plan",
        file_url,
        file_name: file.name,
        notes: "",
        scan_status: "pending",
      });

      setUploadStage("Creating behavior plan record...");
      await base44.entities.BehaviorPlan.create({
        child_id: selectedChildId,
        clinician_id: user.id,
        created_by: user.id,
        file_url,
        file_name: file.name,
        behavior_name: file.name.replace(/\.[^/.]+$/, ""),
        behavior_description: "Uploaded document — review and update details.",
        severity_level: "moderate",
        status: "draft",
      });

      setStatus({ type: "success", message: "Behavior plan uploaded successfully." });
      setFile(null);
      setSelectedChildId("");
    } catch (error) {
      console.error("Upload error:", error);
      setStatus({ type: "error", message: "Upload failed. Please try again." });
    } finally {
      setUploading(false);
      setUploadStage("");
    }
  };

  const selectedChild = children.find(c => c.id === selectedChildId);

  return (
    <div className="min-h-screen bg-background p-6 font-inter">
      <div className="max-w-2xl mx-auto">
        <Button variant="ghost" onClick={() => navigate("/ClinicianDashboard")} className="mb-6">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Dashboard
        </Button>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-card border border-border rounded-2xl p-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Upload className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-foreground">Upload Behavior Plan</h1>
              <p className="text-sm text-muted-foreground">Stored securely in the cloud</p>
            </div>
          </div>

          <p className="text-sm text-muted-foreground bg-muted/50 rounded-xl p-3 mb-6">
            Upload an existing behavior plan document (PDF, DOCX, or TXT).
          </p>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Select Client</label>
              <Select value={selectedChildId} onValueChange={setSelectedChildId}>
                <SelectTrigger><SelectValue placeholder="Choose a client" /></SelectTrigger>
                <SelectContent>
                  {children.map((child) => (
                    <SelectItem key={child.id} value={child.id}>{child.child_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedChild && (
                <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                  <User className="w-3 h-3" />
                  {selectedChild.child_name}, Age {selectedChild.age} {selectedChild.diagnosis ? `· ${selectedChild.diagnosis}` : ""}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Upload Document</label>
              <label htmlFor="file-upload" className={`flex flex-col items-center justify-center w-full h-40 border-2 border-dashed rounded-2xl cursor-pointer transition-colors ${file ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"}`}>
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  {file ? (
                    <>
                      <FileText className="w-10 h-10 text-primary mb-2" />
                      <p className="text-sm font-medium text-foreground">{file.name}</p>
                      <p className="text-xs text-muted-foreground mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                    </>
                  ) : (
                    <>
                      <Upload className="w-10 h-10 text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground"><span className="font-medium text-foreground">Click to upload</span> or drag and drop</p>
                      <p className="text-xs text-muted-foreground mt-1">PDF, DOCX, TXT up to 10MB</p>
                    </>
                  )}
                </div>
                <input id="file-upload" type="file" className="hidden" accept=".pdf,.doc,.docx,.txt" onChange={handleFileChange} />
              </label>
            </div>

            {status && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className={`flex items-start gap-3 p-4 rounded-xl ${status.type === "success" ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
                {status.type === "success" ? <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" /> : <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />}
                <p className={`text-sm ${status.type === "success" ? "text-green-700" : "text-red-700"}`}>{status.message}</p>
              </motion.div>
            )}

            <Button onClick={handleUpload} disabled={uploading || !file || !selectedChildId} className="w-full rounded-xl" size="lg">
              {uploading ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{uploadStage || "Uploading..."}</>
              ) : (
                <><Upload className="w-4 h-4 mr-2" />Upload Behavior Plan</>
              )}
            </Button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}