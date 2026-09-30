import React from "react";
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { getApiBase } from "@/lib/api";

const sections = [
  {
    title: "1. Important Information About NeuroPathways",
    paragraphs: [
      "The current consumer version of NeuroPathways is designed for individuals who independently choose to use the platform.",
      "NeuroPathways is not a healthcare provider, health plan, or health insurance company. Unless NeuroPathways is specifically providing services on behalf of a healthcare provider or another HIPAA-regulated entity under an applicable agreement, use of the consumer application does not necessarily create a relationship governed by HIPAA.",
      "Health information voluntarily provided to a consumer application that is not acting for a HIPAA covered entity may not receive the same HIPAA protections that apply while the information is maintained by a healthcare provider. Other federal and state privacy, consumer-protection, health-information, breach-notification, and security laws may nevertheless apply.",
    ],
  },
  {
    title: "2. Information You Choose to Provide",
    paragraphs: [
      "NeuroPathways may collect account and contact information; information identifying the person receiving services; treatment, behavior intervention, safety, crisis, progress, and clinical plans or records; assessments; goals; caregiver observations; behavioral logs; communications; and other information or documents you choose to provide.",
      "Uploaded documents may contain highly sensitive medical, behavioral-health, mental-health, disability, developmental, family, or other personal information. Upload only information that you are legally authorized to possess and share.",
    ],
  },
  {
    title: "3. Parent, Guardian, and Authorized-User Responsibility",
    paragraphs: [
      "When uploading information concerning another person, including a minor child, you represent that you have the legal authority necessary to possess and provide that information to NeuroPathways.",
      "By uploading a document, you represent that it was lawfully obtained, that you are authorized to possess and upload it, that providing it does not knowingly violate another person's legal rights, and that you understand it may contain sensitive health information.",
      "NeuroPathways does not independently determine whether every parent, guardian, caregiver, or other user has a legal right to every uploaded document. Rights concerning minors' health information vary by circumstance and law.",
    ],
  },
  {
    title: "4. Your Choice to Share Health Information",
    paragraphs: [
      "Uploading health information is voluntary. By agreeing or continuing, you acknowledge that you are voluntarily providing potentially sensitive health information and that NeuroPathways must receive, store, and process it to provide requested features.",
      "Electronic storage and transmission involve security risks, and no electronic system can guarantee absolute security. This acknowledgment does not waive rights that cannot legally be waived or eliminate NeuroPathways' obligations under applicable privacy, security, consumer-protection, or breach-notification laws.",
    ],
  },
  {
    title: "5. How NeuroPathways Uses Uploaded Information",
    paragraphs: [
      "NeuroPathways may store and organize documents; identify and simplify information they contain; organize clinician-defined goals; identify behaviors, interventions, recommendations, and safety information; create support cards and summaries; maintain logs; let users review information; and share information with a clinician when the user affirmatively chooses to connect or share.",
      "NeuroPathways supports access to existing care information. It is not intended to independently diagnose conditions or replace licensed healthcare professionals.",
    ],
  },
  {
    title: "6. Artificial Intelligence and Automated Processing",
    paragraphs: [
      "Certain features may use automated systems or artificial intelligence to organize, extract, summarize, or present information in documents users provide. Applicable service providers must meet NeuroPathways' privacy and security requirements.",
      "NeuroPathways will not intentionally use identifiable private health documents to train public or general-purpose AI models unless legally sufficient notice and consent are provided where required. Automated output may contain errors; consult original documents and qualified professionals for treatment or safety decisions.",
    ],
  },
  {
    title: "7. Information Sharing",
    paragraphs: [
      "NeuroPathways does not sell users' private medical records or disclose private health documents to advertisers for targeted advertising based on their contents.",
      "Information may be disclosed as reasonably necessary to provide infrastructure, hosting, security, and document processing; comply with legal obligations; respond to valid process; protect security and integrity; investigate fraud, abuse, or incidents; protect individuals where legally permitted or required; or carry out another disclosure the user authorizes.",
    ],
  },
  {
    title: "8. Sharing Information With a Clinician",
    paragraphs: [
      "NeuroPathways does not automatically treat a healthcare provider as having access to a consumer account merely because the provider created an uploaded document. A user may affirmatively choose to connect a clinician or healthcare organization.",
      "Additional notices, permissions, authorizations, contractual terms, or Business Associate Agreements may apply when NeuroPathways provides services for a HIPAA covered healthcare provider.",
    ],
  },
  {
    title: "9. Security",
    paragraphs: [
      "No electronic service can guarantee that a security incident will never occur. NeuroPathways will maintain reasonable administrative, technical, and organizational safeguards appropriate to the sensitivity of the information it maintains.",
      "Safeguards may include access controls, authentication, encryption, logging, secure infrastructure, monitoring, backups, vulnerability management, employee access restrictions, and incident-response procedures. Users must protect their credentials and report suspected account compromise.",
    ],
  },
  {
    title: "10. Data Breaches and Security Incidents",
    paragraphs: [
      "If NeuroPathways discovers unauthorized acquisition, access, use, or disclosure of health information, it will investigate and take appropriate steps consistent with applicable law. Where legally required, it will notify affected individuals and governmental authorities.",
      "Acceptance of this policy does not waive legally required breach-notification rights.",
    ],
  },
  {
    title: "11. Data Retention and Deletion",
    paragraphs: [
      "NeuroPathways retains personal information as reasonably necessary to provide services, meet operational or legal requirements, resolve disputes, maintain security, and comply with law.",
      "Users may request deletion of eligible account information and documents. Some information may be retained where required by law or needed for security, fraud prevention, or another lawful retention requirement.",
    ],
  },
  {
    title: "12. Children and Minors",
    paragraphs: [
      "NeuroPathways may contain information about minors when an authorized parent, guardian, healthcare provider, or other legally authorized person uses the service. The consumer service is intended to be controlled by authorized adults unless a separate direct-minor service is expressly offered.",
      "Parents and guardians should not assume they are legally entitled to every category of a minor's medical or mental-health information. State law, minor-consent rules, court orders, confidentiality protections, or other circumstances may limit access.",
    ],
  },
  {
    title: "13. Third-Party Documents and Intellectual Property",
    paragraphs: [
      "Uploading a document does not transfer ownership to NeuroPathways. Users retain their rights and grant only those rights reasonably necessary to process information and provide requested services.",
      "Do not upload copyrighted, proprietary, licensed, or confidential materials you are not authorized to provide. Uploading patient-specific records does not grant NeuroPathways the right to redistribute a provider's proprietary materials.",
    ],
  },
  {
    title: "14. Changes to This Privacy Policy",
    paragraphs: [
      "NeuroPathways may update this policy as its service, technology, legal requirements, or privacy practices change. Material changes affecting sensitive health information will be communicated as required by applicable law.",
    ],
  },
  {
    title: "15. Contact and Privacy Requests",
    paragraphs: [
      "Questions, complaints, access requests, deletion requests, or privacy concerns may be directed to the NeuroPathways Privacy Team. Contact details will be provided through NeuroPathways account support.",
    ],
  },
];

export default function PrivacyScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const webUrl = `${getApiBase()}/privacy`;
  const s = StyleSheet.create({
    page: { flex: 1, backgroundColor: colors.background },
    header: { backgroundColor: colors.card, borderBottomColor: colors.border, borderBottomWidth: 1, paddingHorizontal: 24, paddingTop: insets.top + (Platform.OS === "web" ? 67 : 14), paddingBottom: 18 },
    headerInner: { width: "100%", maxWidth: 720, alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 12 },
    mark: { width: 42, height: 42, borderRadius: 12, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
    brand: { color: colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 16 },
    version: { color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 3 },
    content: { width: "100%", maxWidth: 720, alignSelf: "center", paddingHorizontal: 20, paddingTop: 22, paddingBottom: insets.bottom + (Platform.OS === "web" ? 34 : 38) },
    back: { flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start", paddingVertical: 9, marginBottom: 20 },
    backText: { color: colors.mutedForeground, fontFamily: "Inter_500Medium", fontSize: 14 },
    titleRow: { flexDirection: "row", alignItems: "flex-start", gap: 14, marginBottom: 24 },
    shield: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.muted, alignItems: "center", justifyContent: "center" },
    titleWrap: { flex: 1 },
    title: { color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 24, lineHeight: 31 },
    date: { color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 20, marginTop: 8 },
    card: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 20, marginBottom: 15 },
    sectionTitle: { color: colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 17, lineHeight: 24, marginBottom: 12 },
    paragraph: { color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 24, marginBottom: 12 },
    intro: { color: colors.foreground },
    webLink: { flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start", paddingVertical: 10, marginTop: 6 },
    webLinkText: { color: colors.primary, fontFamily: "Inter_600SemiBold", fontSize: 14 },
  });

  return (
    <View style={s.page}>
      <View style={s.header}><View style={s.headerInner}>
        <View style={s.mark}><Feather name="activity" size={21} color={colors.primaryForeground} /></View>
        <View><Text style={s.brand}>NeuroPathways</Text><Text style={s.version}>Privacy Policy · Version 1.0</Text></View>
      </View></View>
      <ScrollView contentContainerStyle={s.content}>
        <Pressable testID="privacy-back" style={s.back} onPress={() => router.back()} accessibilityRole="button">
          <Feather name="arrow-left" size={17} color={colors.mutedForeground} /><Text style={s.backText}>Back</Text>
        </Pressable>
        <View style={s.titleRow}>
          <View style={s.shield}><Feather name="shield" size={24} color={colors.primary} /></View>
          <View style={s.titleWrap}><Text style={s.title}>NeuroPathways Consumer Health Privacy Policy</Text><Text style={s.date}>Effective September 23, 2026 · Last updated September 23, 2026</Text></View>
        </View>
        <View style={s.card}>
          <Text style={[s.paragraph, s.intro]}>NeuroPathways provides a behavioral-health support platform that allows parents, caregivers, clients, and other authorized users to upload health-related documents and convert their information into accessible summaries, goals, support information, and other tools.</Text>
          <Text style={[s.paragraph, s.intro, { marginBottom: 0 }]}>We recognize that behavioral and mental health information is highly sensitive. This policy explains what we collect, why we collect it, how it is used and protected, when it may be disclosed, and your choices.</Text>
        </View>
        {sections.map(section => (
          <View key={section.title} style={s.card}>
            <Text style={s.sectionTitle}>{section.title}</Text>
            {section.paragraphs.map((paragraph, index) => <Text key={paragraph} style={[s.paragraph, index === section.paragraphs.length - 1 && { marginBottom: 0 }]}>{paragraph}</Text>)}
          </View>
        ))}
        {!!getApiBase() && <Pressable testID="privacy-web-link" accessibilityRole="link" style={s.webLink} onPress={() => void Linking.openURL(webUrl)}>
          <Text style={s.webLinkText}>View the current policy on the web</Text><Feather name="external-link" size={15} color={colors.primary} />
        </Pressable>}
      </ScrollView>
    </View>
  );
}