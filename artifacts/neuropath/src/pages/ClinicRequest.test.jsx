import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ClinicRequest from "./ClinicRequest";

const mocks = vi.hoisted(() => ({ mutate: vi.fn() }));

vi.mock("@workspace/api-client-react", () => ({
  useSubmitClinicRequest: () => ({ mutate: mocks.mutate, isPending: false }),
}));

vi.mock("@/components/parentfree/common", () => ({
  Shell: ({ children }) => <div>{children}</div>,
}));

afterEach(() => {
  cleanup();
  mocks.mutate.mockReset();
});

describe("clinic request entry", () => {
  it("submits the existing pending-request form without implying clinic access was created", async () => {
    mocks.mutate.mockImplementation((_request, callbacks) => {
      callbacks.onSuccess({ message: "Your clinic request is pending platform review." });
    });
    render(<MemoryRouter><ClinicRequest /></MemoryRouter>);

    expect(screen.getByText(/this does not create a clinic, administrator account, or access to client records/i)).toBeTruthy();
    fireEvent.change(screen.getByTestId("input-request-clinic-name"), { target: { value: "Northwind Family Clinic" } });
    fireEvent.change(screen.getByTestId("input-request-contact-name"), { target: { value: "Morgan Sample" } });
    fireEvent.change(screen.getByTestId("input-request-work-email"), { target: { value: "morgan@example.test" } });
    fireEvent.click(screen.getByTestId("button-submit-clinic-request"));

    expect(mocks.mutate).toHaveBeenCalledOnce();
    expect(mocks.mutate).toHaveBeenCalledWith(
      {
        data: expect.objectContaining({
          clinicName: "Northwind Family Clinic",
          contactName: "Morgan Sample",
          workEmail: "morgan@example.test",
          website: null,
          requestKey: expect.any(String),
        }),
      },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
    expect((await screen.findByRole("status")).textContent).toMatch(/pending platform review/i);
    expect(screen.queryByText(/administrator account (created|activated)/i)).toBeNull();
  });
});
