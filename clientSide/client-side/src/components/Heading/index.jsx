import React from "react";

const sizes = {
  s: "text-4xl font-bold",
  xs: "text-2xl font-bold",
};

const Heading = ({ children, className = "", size = "s", as, ...restProps }) => {
  const Component = as || "h6";

  return (
    <Component className={`text-gray-800 dark:text-gray-100 font-poppins ${className} ${sizes[size]}`} {...restProps}>
      {children}
    </Component>
  );
};

export { Heading };
