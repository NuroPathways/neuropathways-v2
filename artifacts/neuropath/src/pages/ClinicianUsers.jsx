import { useState, useEffect } from "react";
import { base44 } from '@/api/entities';
import { Users, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { motion } from "framer-motion";
import FamilyAccordionItem from "@/components/clinician/FamilyAccordionItem";

export default function ClinicianUsers() {
  const [families, setFamilies] = useState([]);
  const [children, setChildren] = useState([]);
  const [parentUsers, setParentUsers] = useState([]);
  const [clientAccounts, setClientAccounts] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      let me;
      try { me = await base44.auth.me(); } catch { return; }
      if (!me?.id) return;
      const res = await base44.functions.invoke('getClinicianData', {}).catch(() => null);
      const { families: fams = [], children: kids = [], clientAccounts: accounts = [] } = res?.data || {};

      const parentEmailMap = {};
      kids.forEach((c) => {
        const key = c.parent_id || c.parent_email;
        if (key && !parentEmailMap[key]) {
          parentEmailMap[key] = { id: c.parent_id || key, email: c.parent_email || "", full_name: c.parent_email || "Guardian" };
        }
      });
      const parents = Object.values(parentEmailMap);

      setFamilies(fams.sort((a, b) => (a.family_name || "").localeCompare(b.family_name || "")));
      setChildren(kids);
      setParentUsers(parents);
      setClientAccounts(accounts);
      setLoading(false);
    };
    load();
  }, []);

  const filteredFamilies = families.filter((f) =>
    (f.family_name || "").toLowerCase().includes(search.toLowerCase())
  );

  // Also include families whose children match the search
  const allMatchedFamilyIds = new Set([
    ...filteredFamilies.map((f) => f.id),
    ...children
      .filter((c) => (c.child_name || "").toLowerCase().includes(search.toLowerCase()))
      .map((c) => c.family_id)
      .filter(Boolean),
  ]);

  const displayedFamilies = families.filter((f) => allMatchedFamilyIds.has(f.id));

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto font-inter">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground mb-1">My Families & Clients</h1>
        <p className="text-muted-foreground text-sm">All families and members you manage</p>
      </div>

      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by family or child name..."
          className="pl-9 rounded-xl border-border"
        />
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-muted rounded-xl animate-pulse" />)}
        </div>
      ) : displayedFamilies.length === 0 ? (
        <div className="text-center py-12">
          <Users className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">
            {search ? "No results found." : "No families yet. Add a family from the dashboard."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayedFamilies.map((family, i) => {
            const familyChildren = children.filter((c) => c.family_id === family.id);
            const familyParentIds = new Set(familyChildren.map((c) => c.parent_id).filter(Boolean));
            const familyParents = parentUsers.filter((u) => familyParentIds.has(u.id));
            const familyAccount = clientAccounts.find((a) => a.family_id === family.id) || null;
            return (
              <motion.div
                key={family.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
              >
                <FamilyAccordionItem
                  family={family}
                  children={familyChildren}
                  parentUsers={familyParents}
                  clientAccount={familyAccount}
                />
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}