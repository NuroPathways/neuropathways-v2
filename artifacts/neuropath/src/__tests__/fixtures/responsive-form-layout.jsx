import React from "react";
import { createRoot } from "react-dom/client";
import SignupAuthorityFields from "@/components/signup/SignupAuthorityFields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

function ClinicianForm() {
  const [ageGroup, setAgeGroup] = React.useState("18_plus");
  const [adultConfirmed, setAdultConfirmed] = React.useState(true);

  return (
    <form className="check-form" onSubmit={(event) => event.preventDefault()}>
      <SignupAuthorityFields
        role="clinician"
        ageGroup={ageGroup}
        setAgeGroup={setAgeGroup}
        adultConfirmed={adultConfirmed}
        setAdultConfirmed={setAdultConfirmed}
        parentConfirmed={false}
        setParentConfirmed={() => {}}
      />
      <div className="check-grid">
        <div>
          <Label data-check-text htmlFor="clinician-first" className="block leading-normal">
            Client first name or preferred nickname
          </Label>
          <Input data-react-control="input" id="clinician-first" value="averyaveryaveryaveryavery" readOnly aria-label="Client first name" />
        </div>
        <div>
          <Label data-check-text htmlFor="clinician-last" className="block leading-normal">
            Family or caregiver contact name
          </Label>
          <Input data-react-control="input" id="clinician-last" value="caregivercaregivercaregiver" readOnly aria-label="Caregiver contact name" />
        </div>
      </div>
      <div>
        <Label data-check-text htmlFor="clinician-summary" className="block leading-normal">
          Clinical notes and recommended supports
        </Label>
        <Textarea data-react-control="textarea" id="clinician-summary" value="Review progress and share recommendations with the family." readOnly />
      </div>
      <div>
        <Label data-check-text htmlFor="clinician-select" className="block leading-normal">
          Select the record with the exactlongunbrokenclinicalidentifieraveryaveryavery
        </Label>
        <Select>
          <SelectTrigger id="clinician-select" data-check-text data-react-control="select" aria-label="Select a client record">
            <SelectValue placeholder="Choose a client record" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="current">Current client profile</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex min-w-0 items-center gap-2">
        <Input data-react-control="input" aria-label="Search client by identifier" value="averyaveryaveryaveryavery" readOnly className="min-w-0 flex-1" />
        <Button type="button" data-check-text data-react-control="button" className="shrink-0">
          Find client by exact profile identifier
        </Button>
      </div>
      <div className="pf-error" role="alert" data-check-text>
        A profile with this exactlongunbrokenclinicalidentifieraveryaveryavery could not be saved.
      </div>
      <Button type="button" data-check-text data-react-control="button" className="w-full">
        Save client profile and send family invitation
      </Button>
    </form>
  );
}

createRoot(document.getElementById("clinician-react-form")).render(<ClinicianForm />);
