export function canClinicianDeleteDocument(document, clinicianId) {
  const uploadedBy = document?.uploaded_by ?? document?.uploadedBy;
  return Boolean(clinicianId && uploadedBy === clinicianId);
}
