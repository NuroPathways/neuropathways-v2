import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import AddClientModal from "./AddClientModal";

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("@/api/entities", () => ({
  base44: { functions: { invoke: mocks.invoke } },
}));

afterEach(() => {
  cleanup();
  mocks.invoke.mockReset();
});

async function createFictionalClient({ email = "caregiver@example.test" } = {}) {
  mocks.invoke.mockImplementation(async (name) => {
    if (name === "createClientAccount") return { data: { created: true } };
    if (name === "sendInviteEmail") return { data: { delivery_status: "unavailable" } };
    throw new Error(`Unexpected function ${name}`);
  });

  render(<AddClientModal open onClose={vi.fn()} onSuccess={vi.fn()} clinicianId="fictional-clinician" />);
  fireEvent.click(screen.getByRole("button", { name: /parent \/ family/i }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.change(screen.getByPlaceholderText("First name"), { target: { value: "Fictional" } });
  fireEvent.change(screen.getByPlaceholderText("Last name"), { target: { value: "Caregiver" } });
  fireEvent.change(screen.getByPlaceholderText("email@example.com"), { target: { value: email } });
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.change(screen.getByPlaceholderText("First name or nickname"), { target: { value: "Fictional Child" } });
  fireEvent.click(screen.getByRole("button", { name: "Create Account" }));

  await screen.findByText(/Client account created, but no invitation email was sent/i);
}

describe("Add New Client invitation outcome", () => {
  it("does not claim the no-op invitation was sent after creating the account", async () => {
    await createFictionalClient();
    expect(screen.queryByText(/invite email sent|invitation email delivered/i)).toBeNull();
    expect(mocks.invoke.mock.calls.map(([name]) => name)).toEqual(["createClientAccount", "sendInviteEmail"]);
    expect(mocks.invoke.mock.calls.filter(([name]) => name === "createClientAccount")).toHaveLength(1);
  });

  it("retries only the invitation after an email failure, not client creation", async () => {
    let emailAttempts = 0;
    mocks.invoke.mockImplementation(async (name) => {
      if (name === "createClientAccount") return { data: { created: true } };
      if (name === "sendInviteEmail") {
        emailAttempts += 1;
        if (emailAttempts === 1) throw new Error("fictional provider error");
        return { data: { delivery_status: "unavailable" } };
      }
      throw new Error(`Unexpected function ${name}`);
    });

    render(<AddClientModal open onClose={vi.fn()} onSuccess={vi.fn()} clinicianId="fictional-clinician" />);
    fireEvent.click(screen.getByRole("button", { name: /parent \/ family/i }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.change(screen.getByPlaceholderText("First name"), { target: { value: "Fictional" } });
    fireEvent.change(screen.getByPlaceholderText("Last name"), { target: { value: "Caregiver" } });
    fireEvent.change(screen.getByPlaceholderText("email@example.com"), { target: { value: "caregiver@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.change(screen.getByPlaceholderText("First name or nickname"), { target: { value: "Fictional Child" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Account" }));
    await screen.findByText(/Client account created, but the invitation email could not be sent/i);

    fireEvent.click(screen.getByRole("button", { name: "Retry Email" }));
    await screen.findByText(/Client account created, but no invitation email was sent/i);
    expect(mocks.invoke.mock.calls.filter(([name]) => name === "createClientAccount")).toHaveLength(1);
    expect(mocks.invoke.mock.calls.filter(([name]) => name === "sendInviteEmail")).toHaveLength(2);
  });
});
