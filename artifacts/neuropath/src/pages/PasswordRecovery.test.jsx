import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import PasswordRecovery from "./PasswordRecovery";

const { requestPasswordReset, completePasswordReset } = vi.hoisted(() => ({
  requestPasswordReset: vi.fn(),
  completePasswordReset: vi.fn(),
}));

vi.mock("@workspace/api-client-react", () => ({
  useRequestPasswordReset: () => ({ isPending: false, mutateAsync: requestPasswordReset }),
  useCompletePasswordReset: () => ({ isPending: false, mutateAsync: completePasswordReset }),
}));

afterEach(() => {
  cleanup();
  requestPasswordReset.mockReset();
  completePasswordReset.mockReset();
  window.history.replaceState(null, "", "/");
});

function renderRecovery(entry) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/ForgotPassword" element={<PasswordRecovery />} />
        <Route path="/ResetPassword" element={<PasswordRecovery />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("password recovery", () => {
  it("requests a clinician reset and confirms without disclosing whether the email exists", async () => {
    requestPasswordReset.mockResolvedValue({ ok: true });
    renderRecovery("/ForgotPassword?accountType=clinician");

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "clinician@example.org" } });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    await waitFor(() => expect(requestPasswordReset).toHaveBeenCalledWith({
      data: { accountType: "clinician", email: "clinician@example.org" },
    }));
    expect(await screen.findByRole("heading", { name: "Check your email" })).toBeTruthy();
    expect(screen.getByText(/If an account matches that sign-in type/)).toBeTruthy();
  });

  it("submits a matching password using the token from the link fragment", async () => {
    completePasswordReset.mockResolvedValue({ ok: true });
    const token = "a".repeat(43);
    window.history.replaceState(null, "", `/ResetPassword#token=${token}&accountType=parent`);
    renderRecovery("/ResetPassword");

    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "NewSecurePassword2026" } });
    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "NewSecurePassword2026" } });
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));

    await waitFor(() => expect(completePasswordReset).toHaveBeenCalledWith({
      data: { token, newPassword: "NewSecurePassword2026" },
    }));
    expect(await screen.findByRole("heading", { name: "Password updated" })).toBeTruthy();
  });
});
