import { TestBed } from '@angular/core/testing';
import { AppComponent } from './app.component';
import { LinksApiService } from './links-api.service';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';

describe('AppComponent', () => {
  let linksApi: jasmine.SpyObj<LinksApiService>;

  beforeEach(async () => {
    linksApi = jasmine.createSpyObj<LinksApiService>('LinksApiService', ['getLinks', 'createLink']);
    linksApi.getLinks.and.returnValue(of([]));
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [{ provide: LinksApiService, useValue: linksApi }],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('validates HTTP and HTTPS URLs', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    app.form.controls.url.setValue('ftp://example.com');
    expect(app.form.invalid).toBeTrue();
    app.form.controls.url.setValue('https://example.com/path');
    expect(app.form.valid).toBeTrue();
  });

  it('renders the short-link form and links table heading', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Short links.');
    expect(compiled.querySelector('#url')).not.toBeNull();
    expect(compiled.querySelector('#links-title')?.textContent).toContain('Recent links');
  });

  it('creates a link and refreshes the table', () => {
    const link = {
      code: 'abc123',
      url: 'https://example.com/path',
      shortUrl: 'http://localhost:3000/abc123',
      hits: 0,
      createdAt: new Date(0).toISOString(),
    };
    linksApi.createLink.and.returnValue(of(link));
    linksApi.getLinks.and.returnValue(of([link]));

    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    fixture.componentInstance.form.controls.url.setValue(link.url);
    fixture.componentInstance.submit();
    fixture.detectChanges();

    expect(linksApi.createLink).toHaveBeenCalledWith(link.url);
    expect(fixture.componentInstance.successLink()).toEqual(link);
    expect(fixture.componentInstance.links()).toEqual([link]);
  });

  it('shows a server validation error beside the URL field', () => {
    linksApi.createLink.and.returnValue(throwError(() => new HttpErrorResponse({
      status: 400,
      error: { error: 'Only HTTP and HTTPS URLs are allowed.' },
    })));

    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    fixture.componentInstance.form.controls.url.setValue('https://example.com');
    fixture.componentInstance.submit();
    fixture.detectChanges();

    expect(fixture.componentInstance.submitError()).toBe('Only HTTP and HTTPS URLs are allowed.');
    expect((fixture.nativeElement as HTMLElement).querySelector('#url-error')?.textContent)
      .toContain('Only HTTP and HTTPS URLs are allowed.');
  });

  it('shows a network error when the API cannot be reached', () => {
    linksApi.createLink.and.returnValue(throwError(() => new HttpErrorResponse({ status: 0 })));

    const fixture = TestBed.createComponent(AppComponent);
    fixture.componentInstance.form.controls.url.setValue('https://example.com');
    fixture.componentInstance.submit();

    expect(fixture.componentInstance.submitError()).toContain('Could not reach the Snip API');
  });
});
