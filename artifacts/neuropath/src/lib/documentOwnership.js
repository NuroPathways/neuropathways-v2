export function canClinicianDeleteDocument(document, clinicianId) {
  const uploadedBy = document?.uploaded_by ?? document?.uploadedBy;
  const assignedClinician = document?.clinician_id ?? document?.clinicianId;
  return Boolean(clinicianId && (uploadedBy === clinicianId || assignedClinician === clinicianId));
}
