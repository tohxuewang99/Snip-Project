import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { LinksApiService, ShortLink } from './links-api.service';

const httpUrlValidator: ValidatorFn = (control): ValidationErrors | null => {
  const value = typeof control.value === 'string' ? control.value.trim() : '';
  if (!value) return null;

  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? null : { httpUrl: true };
  } catch {
    return { httpUrl: true };
  }
};

@Component({
  selector: 'app-root',
  imports: [ReactiveFormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {
  private readonly formBuilder = inject(FormBuilder);
  private readonly linksApi = inject(LinksApiService);

  readonly form = this.formBuilder.nonNullable.group({
    url: ['', [Validators.required, httpUrlValidator]],
  });
  readonly links = signal<ShortLink[]>([]);
  readonly loading = signal(true);
  readonly submitting = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly submitError = signal<string | null>(null);
  readonly successLink = signal<ShortLink | null>(null);

  get urlControl() {
    return this.form.controls.url;
  }

  ngOnInit(): void {
    this.reloadLinks();
  }

  submit(): void {
    if (this.submitting()) return;
    this.submitError.set(null);
    this.successLink.set(null);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.linksApi.createLink(this.urlControl.value.trim())
      .pipe(finalize(() => this.submitting.set(false)))
      .subscribe({
        next: (link) => {
          this.successLink.set(link);
          this.form.reset();
          this.reloadLinks();
        },
        error: (error: unknown) => this.submitError.set(this.errorMessage(error)),
      });
  }

  reloadLinks(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.linksApi.getLinks()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (links) => this.links.set(links),
        error: (error: unknown) => this.loadError.set(this.errorMessage(error)),
      });
  }

  clearMessages(): void {
    this.submitError.set(null);
    this.successLink.set(null);
  }

  private errorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) return 'Could not reach the Snip API. Check that the backend is running and try again.';
      const body: unknown = error.error;
      if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') {
        return body.error;
      }
      return `The request failed (${error.status}). Please try again.`;
    }
    return 'Something went wrong. Please try again.';
  }
}
