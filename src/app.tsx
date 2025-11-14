import {
  Alert,
  Button,
  FormField,
  Rows,
  Text,
  TextInput,
  Title,
} from "@canva/app-ui-kit";
import { upload } from "@canva/asset";
import { FormattedMessage, useIntl } from "react-intl";
import { useCallback, useState } from "react";
import * as styles from "styles/components.css";
import { useAddElement } from "utils/use_add_element";

export const App = () => {
  const intl = useIntl();
  const addElement = useAddElement();
  const [imageUrl, setImageUrl] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Convert file to data URL
  const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Get image dimensions and actual MIME type from URL or data URL
  const getImageInfo = async (
    url: string,
  ): Promise<{ width: number; height: number; mimeType: "image/jpeg" | "image/png" }> => {
    // For data URLs, extract MIME type from the data URL itself
    if (url.startsWith("data:")) {
      const mimeMatch = url.match(/data:([^;]+)/);
      let mimeType: "image/jpeg" | "image/png" = "image/jpeg";
      if (mimeMatch) {
        const detectedType = mimeMatch[1];
        if (detectedType === "image/png") {
          mimeType = "image/png";
        } else if (detectedType === "image/jpeg" || detectedType === "image/jpg") {
          mimeType = "image/jpeg";
        }
      }
      
      // Get dimensions
      const dimensions = await new Promise<{ width: number; height: number }>(
        (resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve({ width: img.width, height: img.height });
          img.onerror = reject;
          img.src = url;
        },
      );
      
      return { ...dimensions, mimeType };
    }

    // For external URLs, try to fetch headers to get actual Content-Type
    let mimeType: "image/jpeg" | "image/png" = "image/jpeg";
    try {
      const response = await fetch(url, { method: "HEAD" });
      const contentType = response.headers.get("content-type");
      if (contentType) {
        if (contentType.includes("image/png")) {
          mimeType = "image/png";
        } else if (
          contentType.includes("image/jpeg") ||
          contentType.includes("image/jpg")
        ) {
          mimeType = "image/jpeg";
        }
      }
    } catch (e) {
      // CORS or other error - fall back to extension check
      const extension = url.split(".").pop()?.toLowerCase().split("?")[0];
      if (extension === "png") {
        mimeType = "image/png";
      }
    }

    // Get dimensions
    const dimensions = await new Promise<{ width: number; height: number }>(
      (resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.width, height: img.height });
        img.onerror = reject;
        img.src = url;
      },
    );

    return { ...dimensions, mimeType };
  };

  // Get MIME type from file by reading actual file content
  const getFileMimeType = async (file: File): Promise<"image/jpeg" | "image/png"> => {
    // First check the file.type if it's reliable
    if (file.type === "image/png") {
      return "image/png";
    }
    if (file.type === "image/jpeg" || file.type === "image/jpg") {
      return "image/jpeg";
    }
    
    // Read the first few bytes to detect the actual format
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const arrayBuffer = e.target?.result as ArrayBuffer;
        if (arrayBuffer) {
          const bytes = new Uint8Array(arrayBuffer.slice(0, 8));
          
          // PNG signature: 89 50 4E 47 0D 0A 1A 0A
          if (
            bytes[0] === 0x89 &&
            bytes[1] === 0x50 &&
            bytes[2] === 0x4e &&
            bytes[3] === 0x47
          ) {
            resolve("image/png");
            return;
          }
          
          // JPEG signature: FF D8 FF
          if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
            resolve("image/jpeg");
            return;
          }
        }
        // Default to JPEG if we can't detect
        resolve("image/jpeg");
      };
      reader.onerror = () => resolve("image/jpeg");
      reader.readAsArrayBuffer(file.slice(0, 8));
    });
  };

  const handleFileUpload = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) {
        setError(
          intl.formatMessage({
            defaultMessage: "Please select an image file",
            description: "Error message when non-image file is selected",
          }),
        );
        return;
      }

      setIsUploading(true);
      setError(null);
      setSuccess(false);

      try {
        // Get actual MIME type from file content
        const mimeType = await getFileMimeType(file);
        
        // Convert file to data URL
        const dataUrl = await fileToDataUrl(file);
        
        // Get image dimensions and verify MIME type
        const { width, height } = await getImageInfo(dataUrl);

        // Upload the image using Canva's upload API
        const image = await upload({
          type: "image",
          mimeType,
          url: dataUrl,
          thumbnailUrl: dataUrl,
          width,
          height,
          aiDisclosure: "none",
        });

        // Add the image element to the current design
        await addElement({
          type: "image",
          ref: image.ref,
          altText: {
            text: file.name || "uploaded image",
            decorative: undefined,
          },
        });

        // Wait for upload to complete
        await image.whenUploaded();

        setSuccess(true);
        setImageUrl(""); // Clear the URL input
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : intl.formatMessage({
                defaultMessage: "Failed to upload image. Please try again.",
                description: "Generic error message for upload failure",
              }),
        );
      } finally {
        setIsUploading(false);
      }
    },
    [addElement, intl],
  );

  const handleUrlUpload = useCallback(
    async (url: string) => {
      if (!url.trim()) {
        setError(
          intl.formatMessage({
            defaultMessage: "Please enter an image URL",
            description: "Error message when URL is empty",
          }),
        );
        return;
      }

      setIsUploading(true);
      setError(null);
      setSuccess(false);

      try {
        // Validate URL format
        new URL(url);

        // Get image dimensions and actual MIME type
        const { width, height, mimeType } = await getImageInfo(url);

        // Upload the image using Canva's upload API
        const image = await upload({
          type: "image",
          mimeType,
          url,
          thumbnailUrl: url,
          width,
          height,
          aiDisclosure: "none",
        });

        // Add the image element to the current design
        await addElement({
          type: "image",
          ref: image.ref,
          altText: {
            text: "uploaded image",
            decorative: undefined,
          },
        });

        // Wait for upload to complete
        await image.whenUploaded();

        setSuccess(true);
        setImageUrl(""); // Clear the URL input
      } catch (err) {
        if (err instanceof TypeError && err.message.includes("Invalid URL")) {
          setError(
            intl.formatMessage({
              defaultMessage: "Please enter a valid URL",
              description: "Error message for invalid URL format",
            }),
          );
        } else {
          setError(
            err instanceof Error
              ? err.message
              : intl.formatMessage({
                  defaultMessage: "Failed to upload image. Please check the URL and try again.",
                  description: "Error message for URL upload failure",
                }),
          );
        }
      } finally {
        setIsUploading(false);
      }
    },
    [addElement, intl],
  );

  const handleFileInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        handleFileUpload(file);
      }
      // Reset input to allow selecting the same file again
      event.target.value = "";
    },
    [handleFileUpload],
  );

  return (
    <div className={styles.scrollContainer}>
      <Rows spacing="3u">
        <Title>
          <FormattedMessage
            defaultMessage="Image Upload"
            description="Title of the image upload app"
          />
        </Title>
        <Text>
          <FormattedMessage
            defaultMessage="Upload images to your Canva design by entering an image URL or selecting a file from your device."
            description="Description of the image upload functionality"
          />
        </Text>

        <Rows spacing="2u">
          <FormField
            label={intl.formatMessage({
              defaultMessage: "Image URL",
              description: "Label for image URL input field",
            })}
            value={imageUrl}
            error={error && imageUrl ? error : undefined}
            control={(props) => (
              <TextInput
                {...props}
                onChange={(value) => {
                  setImageUrl(value);
                  setError(null);
                  setSuccess(false);
                }}
                placeholder={intl.formatMessage({
                  defaultMessage: "https://example.com/image.jpg",
                  description: "Placeholder text for image URL input",
                })}
                disabled={isUploading}
              />
            )}
          />

          <Button
            variant="primary"
            onClick={() => handleUrlUpload(imageUrl)}
            stretch
            disabled={isUploading || !imageUrl.trim()}
            loading={isUploading}
          >
            {intl.formatMessage({
              defaultMessage: "Upload from URL",
              description: "Button text to upload image from URL",
            })}
          </Button>
        </Rows>

        <Rows spacing="2u">
          <FormField
            label={intl.formatMessage({
              defaultMessage: "Upload from Device",
              description: "Label for file upload input",
            })}
            control={(props) => (
              <input
                {...props}
                type="file"
                accept="image/*"
                onChange={handleFileInputChange}
                disabled={isUploading}
                style={{
                  width: "100%",
                  padding: "8px",
                  border: "1px solid var(--ui-kit-color-border-fg)",
                  borderRadius: "4px",
                  fontSize: "14px",
                }}
              />
            )}
          />
        </Rows>

        {error && (
          <Alert tone="critical">
            {error}
          </Alert>
        )}

        {success && (
          <Alert tone="positive">
            <FormattedMessage
              defaultMessage="Image uploaded successfully!"
              description="Success message after image upload"
            />
          </Alert>
        )}
      </Rows>
    </div>
  );
};
