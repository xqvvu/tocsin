// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { Field, FieldError, FieldLabel } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { Textarea } from "#/components/ui/textarea";

describe("field error association", () => {
  it("describes the control with the field's error text", () => {
    render(
      <Field>
        <FieldLabel htmlFor="field-name">Name</FieldLabel>
        <Input id="field-name" aria-describedby="caller-id" />
        <FieldError errors={[{ message: "Name is required" }]} />
      </Field>,
    );

    const describedBy = screen.getByLabelText("Name").getAttribute("aria-describedby")?.split(" ");

    // A caller's own ids survive the merge...
    expect(describedBy).toContain("caller-id");
    // ...and the generated id points at this field's message.
    expect(
      describedBy?.some((id) => document.getElementById(id)?.textContent === "Name is required"),
    ).toBe(true);
  });

  it("drops the reference when the message goes away", () => {
    const { rerender } = render(
      <Field>
        <FieldLabel htmlFor="field-body">Body</FieldLabel>
        <Textarea id="field-body" />
        <FieldError errors={[{ message: "Broken" }]} />
      </Field>,
    );

    const errorId = screen.getByLabelText("Body").getAttribute("aria-describedby");

    expect(document.getElementById(errorId as string)?.textContent).toBe("Broken");

    rerender(
      <Field>
        <FieldLabel htmlFor="field-body">Body</FieldLabel>
        <Textarea id="field-body" />
        <FieldError errors={[]} />
      </Field>,
    );

    // A dangling reference is worse than none: the attribute only exists while
    // the element it points at does.
    expect(screen.getByLabelText("Body").getAttribute("aria-describedby")).toBeNull();
  });
});
