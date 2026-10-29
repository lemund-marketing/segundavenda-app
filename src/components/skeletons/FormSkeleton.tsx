import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface FormSkeletonProps {
  sections?: number;
  fieldsPerSection?: number;
}

const FormSkeleton = ({ sections = 3, fieldsPerSection = 4 }: FormSkeletonProps) => {
  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>

      {/* Form Sections */}
      {Array.from({ length: sections }).map((_, sectionIndex) => (
        <Card key={sectionIndex}>
          <CardHeader>
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-56" />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Array.from({ length: fieldsPerSection }).map((_, fieldIndex) => (
                <div key={fieldIndex} className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ))}
            </div>
            {sectionIndex === 0 && (
              <Skeleton className="h-10 w-36" />
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default FormSkeleton;
